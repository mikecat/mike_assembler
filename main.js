"use strict";

const mikeAssembler = (function() {
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
		stopSet["\""] =true; stopSet["'"] = true; stopSet["="] = true;
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
			const uops = {"!": true, "+": true, "-": true};
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
		"tokenize": tokenize,
		"parse": parse,
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
