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
		return v;
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

	const evaluate = function(ast, vars, hook = null) {
		const hooked = hook === null ? null : hook(ast, vars);
		if (hooked !== null) return hooked;
		if (ast.kind === "value") {
			if (/^[0-9]+$/.test(ast.value) || /^0o[0-7]+$/i.test(ast.value) ||
			/^0x[0-9a-f]+$/i.test(ast.value) || /^0b[01]+$/i.test(ast.value)) {
				return toBigInt(ast.value);
			} else if (ast.value in vars) {
				return vars[ast.value];
			} else {
				throw "undefined identifier: " + ast.value;
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
					return binOpsForEvaluate[ast.value](v1, v2);
				} else if (ast.value === "&&") {
					const v1 = evaluate(ast.children[0], vars, hook);
					if (v1 === toBigInt(0)) return toBigInt(0);
					const v2 = evaluate(ast.children[1], vars, hook);
					return toBigInt(v2 === toBigInt(0) ? 0 : 1);
				} else if (ast.value === "||") {
					const v1 = evaluate(ast.children[0], vars, hook);
					if (v1 !== toBigInt(0)) return toBigInt(1);
					const v2 = evaluate(ast.children[1], vars, hook);
					return toBigInt(v2 === toBigInt(0) ? 0 : 1);
				}
			} else if (ast.children.length === 1) {
				const v = evaluate(ast.children[0], vars, hook);
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
				return evaluate(ast.children[v === toBigInt(0) ? 2 : 1], vars, hook);
			}
		} else {
			throw "unknown kind of node: " + ast.kind;
		}
		throw "undefined operation";
	};

	const assemble = function(source, outputConfig) {
		const lines = source.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
		let output = "";
		let message = "";
		for (let i = 0; i < lines.length; i++) {
			let outputPart = "";
			try {
				const lineParts = parseLine(lines[i]);
				if (lineParts.inst === "tokenize" && lineParts.ops.length === 1) {
					outputPart = JSON.stringify(tokenize(lineParts.ops[0]));
				} else if (lineParts.inst === "parse" && lineParts.ops.length === 1) {
					outputPart = JSON.stringify(parse(tokenize(lineParts.ops[0])));
				} else if (lineParts.inst === "calc" && lineParts.ops.length === 1) {
					const parsed = parse(tokenize(lineParts.ops[0]));
					if (parsed.kind === "str") {
						outputPart = JSON.stringify(parseString(parsed.value));
					} else {
						outputPart = "" + evaluate(parsed, {});
					}
				} else {
					outputPart = JSON.stringify(lineParts);
				}
			} catch (e) {
				message += "line " + (i + 1) + ": " + e + "\n";
			}
			output += outputPart + "\n";
		}

		return {
			"output": output,
			"message": message
		};
	};

	return {
		"isBigIntSupported": isBigIntSupported,
		"toBigInt": toBigInt,
		"fromBigInt": fromBigInt,
		"tokenize": tokenize,
		"parse": parse,
		"parseString": parseString,
		"evaluate": evaluate,
		"assemble": assemble
	};
})();

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

	assembleButton.addEventListener("click", function() {
		const outputConfig = {
			"outputFormat": settingForm.output_format.value,
			"wordSize": settingForm.word_size.value,
			"endianness": settingForm.endianness.value,
			"defaultByte": settingForm.default_byte.value === "other" ? settingForm.default_byte_other_value.value : settingForm.default_byte.value,
			"addressFormat": settingForm.address_format.value,
			"dataFormat": settingForm.data_format.value
		};
		const result = mikeAssembler.assemble(sourceArea.value, outputConfig);
		outputArea.value = result.output;
		messageArea.value = result.message;
	});
});
