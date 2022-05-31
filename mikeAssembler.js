"use strict";

const mikeAssembler = (function() {
	const isBigIntSupported = function() {
		try {
			BigInt(0);
			return true;
		} catch(e) {
			return false;
		}
	};

	const toBigInt = isBigIntSupported() ? function(v) {
		return BigInt(v);
	} : function(v) {
		return Number(v) | 0;
	};

	const fromBigInt = isBigIntSupported() ? function(v) {
		return Number(v);
	} : function(v) {
		return v | 0;
	};

	const targets = {};
	const registerTarget = function(target) {
		if (target.name in targets) {
			throw "duplicate target: " + target.name;
		}
		targets[target.name.toLowerCase()] = target;
	};

	const outputFormats = {
		"raw": {
			"name": "raw",
			"generateOutput": function(outputParts, outputConfig) {
				return {
					"output": JSON.stringify(outputParts, function(key, value) {
						if ((typeof value) === "bigint") {
							return value.toString();
						}
						return value;
					}),
					"message": ""
				};
			}
		}
	};
	const registerOutputFormat = function(of) {
		if (of.name in outputFormats) {
			throw "duplicate output format: " + of.name;
		}
		outputFormats[of.name.toLowerCase()] = of;
	};

	const parseLine = function(line) {
		// タブを空白に変換する
		const tabStop = 4;
		let convertedLine = "";
		for (let i = 0; i < line.length; i++) {
			const c = line.charAt(i);
			if (c === "\t") {
				do {
					convertedLine += " ";
				} while (convertedLine.length % tabStop !== 0);
			} else {
				convertedLine += c;
			}
		}
		// 行を分割する
		let label = null;
		let inst = null;
		const ops = [];
		let start = 0;
		let inToken = false;
		const parenthesisStack = [];
		for (let i = 0; i < line.length; i++) {
			const c = line.charAt(i);
			const cIsSpace = c === " " || c === "\t";
			if (inToken) {
				const pLast = parenthesisStack.length > 0 ? parenthesisStack[parenthesisStack.length - 1] : "";
				if (inst === null && cIsSpace) {
					// 空白 (命令とオペランドの区切り)
					inst = line.substring(start, i);
					inToken = false;
				} else if (label === null && inst === null && c === ":") {
					// ラベル (空白なし)
					label = line.substring(start, i);
					inToken = false;
				} else if (parenthesisStack.length === 0 && c === ",") {
					// オペランドの区切り
					if (inst === null) throw "empty operand not allowed";
					ops.push(line.substring(start, i).replace(/[ \t]+$/, ""));
					inToken = false;
				} else if (parenthesisStack.length === 0 && c === ";") {
					// コメント
					line = line.substring(0, i);
					break;
				} else {
					if (pLast === "\"" || pLast ==="\'") {
						// 文字列内
						const target = line.substring(i);
						if (/^\\[\\rnt0"']/.test(target)) { // " (サクラエディタが無駄に文字列と認識するのを避ける)
							i++;
						} else if (/^\\x[0-9a-f]{2}/i.test(target)) {
							i += 3;
						} else if (c === pLast) {
							parenthesisStack.pop();
						}
					} else {
						// 文字列外
						if (c === "(" || c === "[" || c === "{" || c === "\"" || c === "'") {
							parenthesisStack.push(c);
						} else if (c === ")") {
							if (pLast !== "(") throw "parenthesis mismatch";
							parenthesisStack.pop();
						} else if (c === "]") {
							if (pLast !== "[") throw "parenthesis mismatch";
							parenthesisStack.pop();
						} else if (c === "}") {
							if (pLast !== "{") throw "parenthesis mismatch";
							parenthesisStack.pop();
						}
					}
				}
			} else {
				if (label === null && c === ":") {
					// ラベル (空白あり)
					if (inst === null) throw "empty label not allowed";
					label = inst;
					inst = null;
				} else if (c === ";") {
					// コメント
					line = line.substring(0, i);
					break;
				} else if (c === ",") {
					// カンマ (不正)
					throw "empty operand not allowed";
				} else if (!cIsSpace) {
					// トークン開始
					start = i;
					inToken = true;
					i--;
				}
			}
		}
		if (inToken) {
			if (parenthesisStack.length > 0) {
				const pLast = parenthesisStack[parenthesisStack.length - 1];
				if (pLast === "\"" || pLast === "'") {
					throw "string not ended";
				} else {
					throw "parenthesis mismatch";
				}
			}
			const lastToken = line.substr(start).replace(/[ \t]+$/, "");
			if (inst === null) {
				inst = lastToken;
			} else {
				ops.push(lastToken);
			}
		} else {
			if (ops.length > 0) throw "empty operand not allowed";
		}
		return {
			"line": convertedLine,
			"label": label,
			"inst": inst,
			"ops": ops
		};
	};

	const tokenize = function(expr) {
		const tokens = [];
		const ops = [
			"<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
			"+", "-", "*", "/", "%", "!", "&", "|", "^", "~", "<", ">", "?", ":", ",",
			"(", ")", "[", "]", "{", "}"
		];
		const opSet = {}, stopSet = {};
		for (let i = 0; i < ops.length; i++) {
			opSet[ops[i]] = true;
			if (ops[i].length == 1) stopSet[ops[i]] = true;
		}
		stopSet["\""] = true; stopSet["'"] = true; stopSet["="] = true;
		stopSet[" "] = true; stopSet["\t"] = true;
		for (let i = 0; i < expr.length; i++) {
			const c = expr.substring(i, i + 1);
			const cc = expr.substring(i, i + 2);
			if (i + 1 < expr.length && (cc in opSet)) {
				tokens.push({"kind": "op", "token": cc});
				i++;
			} else if (c in opSet) {
				tokens.push({"kind": "op", "token": c});
			} else if (c === "\"" || c === "'") {
				let token = null;
				for (let j = i + 1; j < expr.length; j++) {
					const next = expr.substring(j);
					if (/^\\[\\rnt0"']/.test(next)) { // " (サクラエディタが無駄に文字列と認識するのを避ける)
						j++;
					} else if (/^\\x[0-9a-f]{2}/i.test(next)) {
						j += 3;
					} else if (expr.charAt(j) === c) {
						token = expr.substring(i, j + 1);
						i = j;
						break;
					}
				}
				if (token === null) throw "string not ended";
				tokens.push({"kind": "str", "token": token});
			} else if (c === " " || c === "\t") {
				// 空白を無視する
			} else {
				let end = expr.length;
				for(let j = i + 1; j < expr.length; j++) {
					if (expr.charAt(j) in stopSet) {
						end = j;
						break;
					}
				}
				tokens.push({"kind": "value", "token": expr.substring(i, end)});
				i = end - 1;
			}
		}
		return tokens;
	};

	const parse = function(tokens) {
		const syntaxErrorMessage = "expression syntax error";
		const buildParse = function(ops, nextFunction) {
			const opSet = {};
			for (let i = 0; i < ops.length; i++) {
				opSet[ops[i]] = true;
			}
			return function(ts) {
				const firstRes = nextFunction(ts);
				let ast = firstRes.ast, left = firstRes.left;
				while (left.length > 0 && left[0].kind === "op" && (left[0].token in opSet)) {
					const res = nextFunction(left.slice(1));
					const ast2 = res.ast, left2 = res.left;
					ast = {
						"kind": "op",
						"value": left[0].token,
						"children": [ast, ast2]
					};
					left = left2;
				}
				return {
					"ast": ast,
					"left": left
				};
			};
		};

		let lv0;

		const parseValue = function(ts) {
			if (ts.length === 0) throw syntaxErrorMessage;
			if (ts[0].kind === "op") {
				let expect = null;
				if (ts[0].token === "(") expect = ")";
				else if (ts[0].token === "[") expect = "]";
				else if (ts[0].token === "{") expect = "}";
				if (expect !== null) {
					// かっこ
					const res = lv0(ts.slice(1));
					const ast = res.ast, left = res.left;
					if (left.length === 0 || left[0].kind !== "op" || left[0].token !== expect) {
						throw syntaxErrorMessage;
					}
					return {
						"ast": {
							"kind": "op",
							"value": ts[0].token + expect,
							"children": [ast]
						},
						"left": left.slice(1)
					};
				}
			} else {
				// 数値・文字列・識別子
				return {
					"ast": {
						"kind": ts[0].kind,
						"value": ts[0].token,
						"children": []
					},
					"left": ts.slice(1)
				};
			}
		};

		const lv12 = function(ts) {
			const opSet = {"(": ")", "[": "]", "{": "}"};
			const firstRes = parseValue(ts);
			let ast = firstRes.ast, left = firstRes.left;
			while (left.length > 0 && left[0].kind === "op" && (left[0].token in opSet)) {
				const res = lv0(left.slice(1));
				const ast2 = res.ast, left2 = res.left;
				if (left2.length === 0 || left2[0].kind !== "op" || left2[0].token !== opSet[left[0].token]) {
					throw syntaxErrorMessage;
				}
				ast = {
					"kind": "op",
					"value": left[0].token + opSet[left[0].token],
					"children": [ast, ast2]
				};
				left = left2.slice(1);
			}
			return {
				"ast": ast,
				"left": left
			};
		};
		const lv11 = function(ts) {
			const uops = {"!": true, "~": true, "+": true, "-": true};
			if (ts.length > 0 && ts[0].kind === "op" && (ts[0].token in uops)) {
				const res = lv11(ts.slice(1));
				const ast = res.ast, left = res.left;
				return {
					"ast": {
						"kind": "op",
						"value": ts[0].token,
						"children": [ast]
					},
					"left": left
				};
			} else {
				return lv12(ts);
			}
		};
		const lv10 = buildParse(["*", "/", "%"], lv11);
		const lv9 = buildParse(["+", "-"], lv10);
		const lv8 = buildParse(["<<", ">>"], lv9);
		const lv7 = buildParse(["&"], lv8);
		const lv6 = buildParse(["|", "^"], lv7);
		const lv5 = buildParse(["<", ">", "<=", ">="], lv6);
		const lv4 = buildParse(["==", "!="], lv5);
		const lv3 = buildParse(["&&"], lv4);
		const lv2 = buildParse(["||"], lv3);
		const lv1 = function(ts) {
			const firstRes = lv2(ts);
			let ast = firstRes.ast, left = firstRes.left;
			if (left.length > 0 && left[0].kind === "op" && left[0].token === "?") {
				const res = lv0(left.slice(1));
				const ast2 = res.ast, left2 = res.left;
				if (left2.length === 0 || left2[0].kind !== "op" || left2[0].token !== ":") {
					throw syntaxErrorMessage;
				}
				const res2 = lv1(left2.slice(1));
				const ast3 = res2.ast, left3 = res2.left;
				ast = {
					"kind": "op",
					"value": "?:",
					"children": [ast, ast2, ast3]
				};
				left = left3;
			}
			return {
				"ast": ast,
				"left": left
			};
		};

		lv0 = function(ts) {
			const firstRes = lv1(ts);
			let ast = firstRes.ast, left = firstRes.left;
			let children = null;
			while (left.length > 0 && left[0].kind === "op" && left[0].token === ",") {
				const res = lv1(left.slice(1));
				const ast2 = res.ast, left2 = res.left;
				if (children === null) {
					children = [ast, ast2];
				} else {
					children.push(ast2);
				}
				left = left2;
			}
			if (children === null) {
				return {
					"ast": ast,
					"left": left
				};
			} else {
				return {
					"ast": {
						"kind": "op",
						"value": ",",
						"children": children
					},
					"left": left
				};
			}
		}

		const res = lv0(tokens);
		if (res.left.length > 0) throw syntaxErrorMessage;
		return res.ast;
	};

	const parseString = function(str) {
		if (str.length < 2 || str.charAt(0) != str.charAt(str.length - 1) || (str.charAt(0) != "\"" && str.charAt(0) != "'")) {
			throw "not a string";
		}
		const eseqs = {
			"\\": 0x5c, "r": 0x0d, "n": 0x0a, "t": 0x09, "0": 0x00, "\"": 0x22, "'": 0x27
		};
		const res = [];
		for (let i = 1; i < str.length - 1; i++) {
			if (str.charAt(i) == "\\" && (str.charAt(i + 1) in eseqs)) {
				res.push(eseqs[str.charAt(i + 1)]);
				i++;
			} else if (/^\\x[0-9a-f]{2}/i.test(str.substring(i))) {
				res.push(parseInt(str.substring(i + 2, i + 4), 16));
				i += 3;
			} else {
				let c = str.charCodeAt(i);
				const c2 = str.charCodeAt(i + 1);
				if (0xd800 <= c && c <= 0xdbff && 0xdc00 <= c2 && c2 <= 0xdfff) {
					// サロゲートペア
					c = 0x10000 + (c - 0xd800) * 0x400 + (c2 - 0xdc00);
					i++;
				}
				if (c < 0x80) {
					res.push(c);
				} else if (c < 0x800) {
					res.push(0xc0 | ((c >> 6) & 0x1f));
					res.push(0x80 | (c & 0x3f));
				} else if (c < 0x10000) {
					res.push(0xe0 | ((c >> 12) & 0x0f));
					res.push(0x80 | ((c >> 6) & 0x3f));
					res.push(0x80 | (c & 0x3f));
				} else {
					res.push(0xf0 | ((c >> 18) & 0x07));
					res.push(0x80 | ((c >> 12) & 0x3f));
					res.push(0x80 | ((c >> 6) & 0x3f));
					res.push(0x80 | (c & 0x3f));
				}
			}
		}
		return res;
	};

	const binOpsForEvaluate = {
		"*": function(a, b) { return a * b; },
		"/": function(a, b) {
			if (b === toBigInt(0)) throw "division by zero";
			return (a / b) | toBigInt(0);
		},
		"%": function(a, b) {
			if (b === toBigInt(0)) throw "division by zero";
			return a % b;
		},
		"+": function(a, b) { return a + b; },
		"-": function(a, b) { return a - b; },
		"<<": function(a, b) { return a << b; },
		">>": function(a, b) { return a >> b; },
		"&": function(a, b) { return a & b; },
		"|": function(a, b) { return a | b; },
		"^": function(a, b) { return a ^ b; },
		"<": function(a, b) { return toBigInt(a < b ? 1 : 0); },
		">": function(a, b) { return toBigInt(a > b ? 1 : 0); },
		"<=": function(a, b) { return toBigInt(a <= b ? 1 : 0); },
		">=": function(a, b) { return toBigInt(a >= b ? 1 : 0); },
		"==": function(a, b) { return toBigInt(a === b ? 1 : 0); },
		"!=": function(a, b) { return toBigInt(a !== b ? 1 : 0); }
	};

	const evaluate = function(ast, vars, throwOnUndefinedIdentifier, hook) {
		if ((typeof throwOnUndefinedIdentifier) === "undefined") throwOnUndefinedIdentifier = true;
		if ((typeof hook) === "undefined") hook = null;
		const hooked = hook === null ? null : hook(ast, vars);
		if (hooked !== null) return hooked;
		if (ast.kind === "value") {
			if (/^[0-9]+$/.test(ast.value) || /^0o[0-7]+$/i.test(ast.value) ||
			/^0x[0-9a-f]+$/i.test(ast.value) || /^0b[01]+$/i.test(ast.value)) {
				return toBigInt(ast.value);
			} else if (ast.value in vars) {
				if (throwOnUndefinedIdentifier && vars[ast.value] === null) {
					throw "value of " + ast.value + " isn't defined";
				}
				return vars[ast.value];
			} else if (throwOnUndefinedIdentifier) {
				throw "undefined identifier: " + ast.value;
			} else {
				return null;
			}
		} else if (ast.kind === "str") {
			if (ast.value.charAt(0) === "'") {
				const eseqs = {
					"\\": 0x5c, "r": 0x0d, "n": 0x0a, "t": 0x09, "0": 0x00, "\"": 0x22, "'": 0x27
				};
				if (ast.value.length == 4 && ast.value.charAt(1) == "\\" && (ast.value.charAt(2) in eseqs)) {
					return toBigInt(eseqs[ast.value.charAt(2)]);
				} else if (/^'\\x[0-9a-f]{2}'$/i.test(ast.value)) {
					return toBigInt(parseInt(ast.value.substring(3, 5), 16));
				} else {
					const c = ast.value.charCodeAt(1), c2 = ast.value.charCodeAt(2);
					if (ast.value.length === 4 && 0xd800 <= c && c <= 0xdbff && 0xdc00 <= c2 && c2 <= 0xdfff) {
						// サロゲートペア
						return toBigInt(0x10000 + (c - 0xd800) * 0x400 + (c2 - 0xdc00));
					} else if (ast.value.length === 3) {
						return toBigInt(c);
					}
				}
				throw "invalid character constant";
			}
		} else if (ast.kind === "op") {
			if (ast.children.length === 2) {
				if (ast.value in binOpsForEvaluate) {
					const v1 = evaluate(ast.children[0], vars, hook);
					const v2 = evaluate(ast.children[1], vars, hook);
					if (v1 === null || v2 === null) return null;
					return binOpsForEvaluate[ast.value](v1, v2);
				} else if (ast.value === "&&") {
					const v1 = evaluate(ast.children[0], vars, hook);
					if (v1 === null) return null;
					if (v1 === toBigInt(0)) return toBigInt(0);
					const v2 = evaluate(ast.children[1], vars, hook);
					if (v2 === null) return null;
					return toBigInt(v2 === toBigInt(0) ? 0 : 1);
				} else if (ast.value === "||") {
					const v1 = evaluate(ast.children[0], vars, hook);
					if (v1 === null) return null;
					if (v1 !== toBigInt(0)) return toBigInt(1);
					const v2 = evaluate(ast.children[1], vars, hook);
					if (v2 === null) return null;
					return toBigInt(v2 === toBigInt(0) ? 0 : 1);
				}
			} else if (ast.children.length === 1) {
				const v = evaluate(ast.children[0], vars, hook);
				if (v === null) return null;
				if (ast.value === "!") {
					return toBigInt(v === toBigInt(0) ? 1 : 0);
				} else if (ast.value === "~") {
					return ~v;
				} else if (ast.value === "-") {
					return -v;
				}  else if (ast.value === "+" || ast.value === "()") {
					return v;
				}
			} else if (ast.children.length === 3 && ast.value === "?:") {
				const v = evaluate(ast.children[0], vars, hook);
				if (v === null) return null;
				return evaluate(ast.children[v === toBigInt(0) ? 2 : 1], vars, hook);
			}
		} else {
			throw "unknown kind of node: " + ast.kind;
		}
		throw "undefined operation";
	};

	const builtins = function(pos, inst, ops, context) {
		const instLower = inst.toLowerCase();
		if (instLower === "org") {
			if (ops.length !== 1 && ops.length !== 2) throw "org takes 1 or 2 argument";
			const nextPos = evaluate(parse(tokenize(ops[0])), context.vars);
			const nextLabelPos = ops.length === 2 ? evaluate(parse(tokenize(ops[1])), context.vars) : nextPos;
			if (nextPos < 0 || nextLabelPos < 0) throw "invalid position";
			context.posOffset = nextPos - nextLabelPos;
			return {
				"nextPos": nextLabelPos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "outstart") {
			if (ops.length !== 1) throw "outstart takes exactly 1 argument";
			const startPos = evaluate(parse(tokenize(ops[0])), context.vars);
			if (startPos < 0) throw "invalid position";
			if (context.outStart !== null) throw "multiple outstart";
			context.outStart = startPos;
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "passlimit") {
			if (ops.length !== 1) throw "passlimit takes exactly 1 argument";
			const passLimit = evaluate(parse(tokenize(ops[0])), context.vars);
			if (passLimit < 1) throw "invalid pass limit";
			if (context.passLimitSet) throw "multiple passlimit";
			context.passLimitSet = true;
			if (context.pass === 1) context.passLimit = passLimit;
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "align") {
			if (ops.length !== 1 && ops.length !== 2) throw "align takes 1 or 2 arguments";
			const divisor = evaluate(parse(tokenize(ops[0])), context.vars);
			if (divisor <= 0) throw "invalid divisor";
			const remainder = ops.length < 2 ? toBigInt(0) : evaluate(parse(tokenize(ops[1])), context.vars);
			if (remainder < 0 || divisor <= remainder) throw "invalid remainder";
			const nextPos = pos % divisor === remainder ? pos : pos + (divisor - (pos + divisor - remainder) % divisor);
			return {
				"nextPos": nextPos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "alignfill") {
			if (ops.length !== 1 && ops.length !== 2) throw "alignfill takes 2 or 3 arguments";
			const divisor = evaluate(parse(tokenize(ops[0])), context.vars);
			if (divisor <= 0) throw "invalid divisor";
			const data = evaluate(parse(tokenize(ops[1])), context.vars, context.pass !== 1);
			if (data !== null && (data < -0x80 || 0xff < data)) throw "data out of range";
			const remainder = ops.length < 3 ? toBigInt(0) : evaluate(parse(tokenize(ops[2])), context.vars);
			if (remainder < 0 || divisor <= remainder) throw "invalid remainder";
			const nextPos = pos % divisor === remainder ? pos : pos + (divisor - (pos + divisor - remainder) % divisor);
			const dataArray = [];
			for (let i = pos; i < nextPos; i++) dataArray.push(data);
			return {
				"nextPos": nextPos,
				"data": dataArray,
				"wordSize": 1
			};
		} else if (instLower === "space") {
			if (ops.length !== 1) throw "space takes exactly 1 argument";
			const spaceSize = evaluate(parse(tokenize(ops[0])), context.vars);
			if (spaceSize < 0) throw "invalid size";
			return {
				"nextPos": pos + spaceSize,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "fill") {
			if (ops.length !== 2) throw "fill takes exactly 2 arguments";
			const fillSize = evaluate(parse(tokenize(ops[0])), context.vars);
			if (fillSize < 0) throw "invalid size";
			const data = evaluate(parse(tokenize(ops[1])), context.vars, context.pass !== 1);
			if (data !== null && (data < -0x80 || 0xff < data)) throw "data out of range";
			const dataArray = [];
			for (let i = 0; i < fillSize; i++) dataArray.push(data);
			return {
				"nextPos": pos + fillSize,
				"data": dataArray,
				"wordSize": 1
			};
		} else if (instLower === "fillto") {
			if (ops.length !== 2) throw "fillto takes exactly 2 arguments";
			const nextPos = evaluate(parse(tokenize(ops[0])), context.vars);
			if (nextPos < pos) throw "filling backward isn't allowed";
			const data = evaluate(parse(tokenize(ops[1])), context.vars, context.pass !== 1);
			if (data !== null && (data < -0x80 || 0xff < data)) throw "data out of range";
			const dataArray = [];
			for (let i = pos; i < nextPos; i++) dataArray.push(data);
			return {
				"nextPos": nextPos,
				"data": dataArray,
				"wordSize": 1
			};
		} else if (instLower === "target") {
			if (ops.length !== 1) throw "target takes exactly 1 argument";
			const tLower = ops[0].toLowerCase();
			if (!(tLower in targets)) throw "unknown target: " + tLower;
			context.target = targets[tLower];
			if (!(context.target.name in context.targetData)) {
				context.targetData[context.target.name] = {};
			}
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "endianness") {
			if (ops.length !== 1) throw "endianness takes exactly 1 argument";
			const eLower = ops[0].toLowerCase();
			if (eLower !== "little" && eLower !== "big") throw "invalid endianness: " + eLower;
			context.endianness = eLower;
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "define") {
			if (ops.length !== 2) throw "define takes exactly 2 arguments";
			if (ops[0] in context.vars) {
				throw "duplicate definition of " + ops[0];
			}
			const value = evaluate(parse(tokenize(ops[1])), context.vars, context.pass !== 1);
			context.vars[ops[0]] = value;
			context.defines[ops[0]] = value;
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (instLower === "redefine") {
			if (ops.length !== 2) throw "redefine takes exactly 2 arguments";
			if (!(ops[0] in context.defines)) {
				throw ops[0] + "is not defined";
			}
			const value = evaluate(parse(tokenize(ops[1])), context.vars, context.pass !== 1);
			context.vars[ops[0]] = value;
			context.defines[ops[0]] = value;
			return {
				"nextPos": pos,
				"data": [],
				"wordSize": 1
			};
		} else if (/^data[nbwlq]?$/.test(instLower)) {
			if (ops.length === 0) throw "no data";
			let wordSize, rangeMin, rangeMax;
			const kind = instLower.charAt(4);
			if (kind === "n") {
				wordSize = 0;
				rangeMin = -0x8;
				rangeMax = 0xf;
			} else if (kind === "w") {
				wordSize = 2;
				rangeMin = -0x8000;
				rangeMax = 0xffff;
			} else if (kind === "l") {
				wordSize = 4;
				rangeMin = -0x80000000;
				rangeMax = 0xffffffff;
			} else if (kind === "q") {
				wordSize = 8;
				rangeMin = -toBigInt("0x8000000000000000");
				rangeMax = toBigInt("0xffffffffffffffff");
			} else {
				wordSize = 1;
				rangeMin = -0x80;
				rangeMax = 0xff;
			}
			const dataArray = [];
			for (let i = 0; i < ops.length; i++) {
				const ast = parse(tokenize(ops[i]));
				if (ast.kind === "str" && ast.value.charAt(0) === "\"") {
					const data = parseString(ast.value);
					while (data.length % wordSize != 0) data.push(0);
					if (wordSize <= 0) {
						for (let i = 0; i < data.length; i++) {
							let word = toBigInt(data[i]);
							if (word < rangeMin || rangeMax < word) throw "data out of range";
							dataArray.push(word);
						}
					} else if (context.endianness === "big") {
						for (let i = 0; i < data.length; i += wordSize) {
							let word = toBigInt(0);
							for (let j = 0; j < wordSize; j++) {
								word = (word << toBigInt(8)) | toBigInt(data[i + j]);
							}
							dataArray.push(word);
						}
					} else {
						for (let i = 0; i < data.length; i += wordSize) {
							let word = toBigInt(0);
							for (let j = 1; j <= wordSize; j++) {
								word = (word << toBigInt(8)) | toBigInt(data[i + wordSize - j]);
							}
							dataArray.push(word);
						}
					}
				} else {
					const data = evaluate(ast, context.vars, context.pass !== 1);
					if (data !== null && (data < rangeMin || rangeMax < data)) throw "data out of range";
					dataArray.push(data);
				}
			}
			return {
				"nextPos": pos + toBigInt(wordSize < 1 ? 1 : wordSize) * toBigInt(dataArray.length),
				"data": dataArray,
				"wordSize": wordSize
			};
		}
		return null;
	};

	const wordsToData = function(words, wordSize, endianness) {
		const res = [];
		if (wordSize <= 0) {
			for (let i = 0; i < words.length; i++) {
				if (words[i] === null) {
					res.push(null);
				} else {
					res.push(fromBigInt(words[i] & toBigInt(0xff)));
				}
			}
		} else if (endianness === "big") {
			for (let i = 0; i < words.length; i++) {
				if (words[i] === null) {
					for (let j = 0; j < wordSize; j++) res.push(null);
				} else {
					for (let j = 1; j <= wordSize; j++) {
						res.push(fromBigInt((words[i] >> (toBigInt(8 * (wordSize - j)))) & toBigInt(0xff)));
					}
				}
			}
		} else {
			for (let i = 0; i < words.length; i++) {
				if (words[i] === null) {
					for (let j = 0; j < wordSize; j++) res.push(null);
				} else {
					for (let j = 0; j < wordSize; j++) {
						res.push(fromBigInt((words[i] >> (toBigInt(8 * j))) & toBigInt(0xff)));
					}
				}
			}
		}
		return res;
	};

	const apis = {
		"isBigIntSupported": isBigIntSupported,
		"toBigInt": toBigInt,
		"fromBigInt": fromBigInt,
		"registerTarget": registerTarget,
		"registerOutputFormat": registerOutputFormat,
		"tokenize": tokenize,
		"parse": parse,
		"parseString": parseString,
		"evaluate": evaluate
	};

	const assemble = function(source, outputConfig) {
		const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n+$/, "").split("\n");
		const linesParsed = [];
		let pos = toBigInt(0);
		const context = {
			"passLimit": 100
		};
		let outputParts = [];
		let message = "";
		let error = false;
		let converged = false;
		let unconvergedLabels = {};
		for (let pass = 1; !error && pass <= context.passLimit; pass++) {
			pos = toBigInt(0);
			context.pass = pass;
			context.passLimitSet = false;
			context.target = null;
			context.outStart = null;
			context.endianness = "little";
			context.posOffset = toBigInt(0);
			context.vars = {};
			context.defines = {};
			if (pass !== 1) {
				const labels = context.labelArray;
				for (let i = 0; i < labels.length; i++) {
					context.vars[labels[i]] = context.labels[labels[i]];
				}
				context.labelsPrev = context.labels;
				context.targetPrevData = context.targetData;
			} else {
				context.labelsPrev = {};
				context.targetPrevData = {};
			}
			context.targetData = {};
			context.labels = {};
			context.labelArray = [];
			outputParts = [];
			message = "";

			for (let i = 0; i < lines.length; i++) {
				try {
					if (pass === 1) linesParsed.push(parseLine(lines[i]));
					const lineParsed = linesParsed[i];
					if (lineParsed.label !== null) {
						if (lineParsed.label in context.labels ||
						(!(lineParsed.label in context.labelsPrev) && (lineParsed.label in context.vars))) {
							throw "multiple definitions of " + lineParsed.label;
						} else {
							context.vars[lineParsed.label] = pos;
							context.labels[lineParsed.label] = pos;
							context.labelArray.push(lineParsed.label);
						}
					}
					if (lineParsed.inst !== null) {
						let res = builtins(pos, lineParsed.inst, lineParsed.ops, context);
						if (res === null && context.target !== null) {
							res = context.target.assembleLine(pos, lineParsed.inst, lineParsed.ops, context, apis);
						}
						if (res === null) {
							throw "undefined instruction: " + lineParsed.inst;
						}
						if (("warning" in res) && res.warning !== null) {
							message += "line " + (i + 1) + ": warning: " + res.warning + "\n";
						}
						if (("warnings" in res) && res.warnings !== null) {
							for (let j = 0; j < res.warnings.length; j++) {
								message += "line " + (i + 1) + ": warning: " + res.warnings[j] + "\n";
							}
						}
						outputParts.push({
							"line": lineParsed.line,
							"lineno": i + 1,
							"pos": (lineParsed.inst === "org" ? res.nextPos : pos) + context.posOffset,
							"data": wordsToData(res.data, res.wordSize, context.endianness),
							"wordSize": res.wordSize
						});
						pos = res.nextPos;
					} else {
						outputParts.push({
							"line": lineParsed.line,
							"lineno": i + 1,
							"pos": pos + context.posOffset,
							"data": [],
							"wordSize": 1
						});
					};
				} catch (e) {
					message += "line " + (i + 1) + ": error: " + e + "\n";
					error = true;
				}
			}
			converged = true;
			unconvergedLabels = {};
			for (let i = 0; i < context.labelArray.length; i++) {
				const labelName = context.labelArray[i];
				if (!(labelName in context.labelsPrev) || context.labelsPrev[labelName] !== context.labels[labelName]) {
					converged = false;
					unconvergedLabels[labelName] = true;
				}
			}
			if (converged) break;
		}
		if (!error) {
			if (!converged) {
				for (let i = 0; i < linesParsed.length; i++) {
					if (linesParsed[i].label in unconvergedLabels) {
						message += "line " + (i + 1) + ": error: label " + linesParsed[i].label + " didn't converge\n";
					}
				}
				error = true;
			}
			for (let i = 0; i < outputParts.length; i++) {
				for (let j = 0; j < outputParts[i].data.length; j++) {
					if (outputParts[i].data[j] === null) {
						message += "line " + outputParts[i].lineno + ": warning: couldn't decide data\n";
						break;
					}
				}
			}
		}

		let output;
		try {
			output = outputFormats[outputConfig.outputFormat].generateOutput(outputParts, outputConfig, context, apis);
		} catch (e) {
			output = {
				"output": "",
				"message": "error thrown from output formatter: " + e + "\n"
			};
			error = true;
		}

		return {
			"output": output.output,
			"message": message + output.message,
			"error": error
		};
	};

	apis.assemble = assemble;
	return apis;
})();

if ((typeof window) !== "undefined") {
	window.addEventListener("DOMContentLoaded", function() {
		const sourceArea = document.getElementById("source_area");
		const assembleButton = document.getElementById("assemble_button");
		const settingForm = document.getElementById("setting_form");
		const outputArea = document.getElementById("output_area");
		const messageArea = document.getElementById("message_area");

		const enableDefaultByteOtherValue = function() {
			settingForm.default_byte_other_value.disabled = !(settingForm.default_byte.value === "other");
		};
		enableDefaultByteOtherValue();
		const defaultByteRadios = document.querySelectorAll("form#setting_form input[type=\"radio\"][name=\"default_byte\"]");
		for (let i = 0; i < defaultByteRadios.length; i++) {
			defaultByteRadios[i].addEventListener("change", enableDefaultByteOtherValue);
		}

		const getRadioValue = function(radio) {
			if((typeof radio.value) !== "undefined") return radio.value;
			for (let i = 0; i < radio.length; i++) {
				if (radio[i].checked) return radio[i].value;
			}
			return "";
		};

		assembleButton.addEventListener("click", function() {
			const outputConfig = {
				"outputFormat": getRadioValue(settingForm.output_format),
				"wordSize": getRadioValue(settingForm.word_size),
				"endianness": getRadioValue(settingForm.endianness),
				"defaultByte": getRadioValue(settingForm.default_byte) === "other" ? settingForm.default_byte_other_value.value : getRadioValue(settingForm.default_byte),
				"addressFormat": getRadioValue(settingForm.address_format),
				"dataFormat": getRadioValue(settingForm.data_format)
			};
			const result = mikeAssembler.assemble(sourceArea.value, outputConfig);
			outputArea.value = result.output;
			messageArea.value = result.message;
		});
	});
}
if ((typeof exports) !== "undefined") {
	exports.mikeAssembler = mikeAssembler;
}
