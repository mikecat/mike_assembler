"use strict";

const nlp16Target = (function() {
	const name = "nlp16";

	const evaluateExpression = function(expr, context) {
		const apis = context.apis;
		return apis.evaluate(apis.parse(apis.tokenize(expr)), context.vars, context.pass > 1,
			function(ast, vars) {
				if (ast.kind === "value" && (ast.value in context.labels || ast.value in context.labelsPrev)) {
					if (vars[ast.value] & apis.toBigInt(1)) {
						throw "unaligned label is used";
					}
					return vars[ast.value] >> apis.toBigInt(1);
				}
				return null;
			});
	};

	const regTable = {
		"ir1"   : 0,
		"ir2"   : 1,
		"ir3"   : 3,
		"flag"  : 4,
		"a"     : 5,
		"b"     : 6,
		"c"     : 7,
		"d"     : 8,
		"e"     : 9,
		"serial": 9,
		"ram"   : 10,
		"device": 10,
		"ua"    : 11,
		"la"    : 12,
		"ip"    : 13,
		"sp"    : 14,
		"zero"  : 15
	};

	const parseReg = function(reg, isInput) {
		const regLower = reg.toLowerCase();
		if (regLower in regTable) {
			const regId = regTable[regLower];
			if (isInput && regId === 1) {
				throw "ir2 cannot be used as input (reserved as 8-bit immediate)";
			}
			return regId;
		} else {
			if (isInput) return null;
			else throw "invalid register: " + reg;
		}
	};

	const flagTable = {
		"_nop": 0x00,
		"_c"  : 0x02,
		"_v"  : 0x04,
		"_z"  : 0x06,
		"_s"  : 0x08,
		""    : 0x01,
		"_nc" : 0x03,
		"_nv" : 0x05,
		"_nz" : 0x07,
		"_ns" : 0x09
	};

	const opNumCheck = function(ops, out, in1, in2) {
		let expected = 0;
		if (out === null) expected++;
		if (in1 === null) expected++;
		if (in2 === null) expected++;
		if (expected != ops.length) {
			throw "expected " + expected + " operand" + (expected === 1 ? "" : "s") + ", " +
				ops.length + " given";
		}
		return true;
	};

	const parse = function(ops, immSize, flag, context, opcode, out, in1, in2) {
		const apis = context.apis;
		opNumCheck(ops, out, in1, in2);
		let results = [(opcode << 8) | (flag << 4), 0];
		let opsPtr = 0;
		if (out !== null) {
			results[0] |= out;
		} else {
			results[0] |= parseReg(ops[opsPtr++], false);
		}
		let imm8 = null, imm16 = null;
		let immediateCount = 0;
		const parseInputOperand = function(op) {
			const reg = parseReg(op, true);
			if (reg !== null) return reg;
			immediateCount++;
			const value = evaluateExpression(op, context);
			if (value === null) return null;
			if (apis.fitsInBitsUnsigned(value, 8) && immSize !== 16) {
				const value8 = apis.fromBigInt(value) & 0xff;
				if (imm8 === null) {
					imm8 = value8;
					return 0x01;
				}
				if (immSize === 8) {
					if (imm8 !== value8) throw "tried to put different immediates into one area";
					return 0x01;
				}
			}
			if ((apis.fitsInBitsSigned(value, 16) || apis.fitsInBitsUnsigned(value, 16)) && immSize !== 8) {
				const value16 = apis.fromBigInt(value) & 0xffff;
				if (imm16 === null) {
					imm16 = value16;
					return 0x02;
				}
				if (immSize === 16) {
					if (imm16 !== value16) throw "tried to put different immediates into one area";
					return 0x02;
				}
			}
			throw "immediate out-of-range";
		};
		if (in1 !== null) {
			results[1] |= in1 << 12;
		} else {
			const parsed = parseInputOperand(ops[opsPtr++]);
			if (parsed !== null) results[1] |= parsed << 12;
			else results[1] = null;
		}
		if (in2 !== null) {
			if (results[1] !== null) results[1] |= in2 << 8;
		} else {
			const parsed = parseInputOperand(ops[opsPtr++]);
			if (results[1] !== null) {
				if (parsed !== null) results[1] |= parsed << 8;
				else results[1] = null;
			}
		}
		if (imm8 !== null && results[1] !== null) {
			results[1] |= imm8;
		}
		if (imm16 !== null || immSize === 16 || (immSize !== 8 && immediateCount >= 2)) {
			results.push(imm16);
		}
		return {
			"warnImmSize": immSize !== null && immediateCount === 0,
			"resultWords": results
		};
	};
	const parser = function(opcode, out, in1, in2) {
		return function(ops, immSize, flag, context) {
			return parse(ops, immSize, flag, context, opcode, out, in1, in2);
		};
	}

	const parseRel = function(ops, immSize, flag, context, opcode, out) {
		const apis = context.apis;
		opNumCheck(ops, out, null);
		let results = [(opcode << 8) | (flag << 4), 0x0d << 12];
		let opsPtr = 0;
		if (out !== null) {
			results[0] |= out;
		} else {
			results[0] |= parseReg(ops[opsPtr++], false);
		}
		const value = evaluateExpression(ops[opsPtr], context);
		let imm16 = null;
		if (value === null) {
			results[1] = null;
		} else {
			const pos = context.targetData[name].pos;
			if (pos & apis.toBigInt(1)) {
				throw "unaligned instruction address is used";
			}
			// まず8ビット即値が使えるかを試す
			let ok = false;
			if (immSize !== 16) {
				const delta = value - ((pos >> apis.toBigInt(1)) + apis.toBigInt(2));
				if (apis.fitsInBitsUnsigned(delta, 8)) {
					// 加算
					results[0] |= 0x0200;
					results[1] |= 0x0100 | apis.fromBigInt(delta);
					ok = true;
				} else if (apis.fitsInBitsUnsigned(-delta, 8)) {
					// 減算
					results[0] |= 0x0100;
					results[1] |= 0x0100 | apis.fromBigInt(-delta);
					ok = true;
				}
			}
			if (!ok && immSize !== 8) {
				// 8ビットに収まらなかったので、16ビット即値が使えるかを試す
				const delta = value - ((pos >> apis.toBigInt(1)) + apis.toBigInt(3));
				if (apis.fitsInBitsUnsigned(delta, 16)) {
					// 加算
					results[0] |= 0x0200;
					results[1] |= 0x0200;
					imm16 = apis.fromBigInt(delta);
					ok = true;
				} else if (apis.fitsInBitsUnsigned(-delta, 16)) {
					// 減算
					results[0] |= 0x0100;
					results[1] |= 0x0200;
					imm16 = apis.fromBigInt(-delta);
					ok = true;
				}
			}
			if (!ok) throw "offset out-of-range";
		}
		if (imm16 !== null || immSize === 16) {
			results.push(imm16);
		}
		return {
			"warnImmSize": false,
			"resultWords": results
		};
	};
	const parserRel = function(opcode, out) {
		return function(ops, immSize, flag, context) {
			return parseRel(ops, immSize, flag, context, opcode, out);
		};
	}

	const parseOne = function(ops, immSize, flag, context, opcode, out) {
		opNumCheck(ops, out);
		let result = (opcode << 8) | (flag << 4);
		if (out !== null) {
			result |= out;
		} else {
			result |= parseReg(ops[0], false);
		}
		return {
			"warnImmSize": immSize !== null,
			"resultWords": [result]
		};
	};
	const parserOne = function(opcode, out) {
		return function(ops, immSize, flag, context) {
			return parseOne(ops, immSize, flag, context, opcode, out);
		};
	}

	const parserTable = {
		"add"     : parser(0x12, null, null, null),
		"sub"     : parser(0x11, null, null, null),
		"addc"    : parser(0x16, null, null, null),
		"subc"    : parser(0x15, null, null, null),
		"or"      : parser(0x05, null, null, null),
		"not"     : parser(0x0c, null, null, 0),
		"xor"     : parser(0x0e, null, null, null),
		"and"     : parser(0x06, null, null, null),
		"inc"     : parser(0x1b, null, null, 0),
		"dec"     : parser(0x18, null, null, 0),
		"incc"    : parser(0x1f, null, null, 0),
		"decc"    : parser(0x1c, null, null, 0),
		"slr"     : parser(0x2c, null, null, 0),
		"sll"     : parser(0x20, null, null, 0),
		"sar"     : parser(0x2c, null, null, 0),
		"sal"     : parser(0x24, null, null, 0),
		"ror"     : parser(0x2a, null, null, 0),
		"rol"     : parser(0x22, null, null, 0),
		"mov"     : parser(0x00, null, null, 0),
		"jmp"     : parser(0x00, 0xd, null, 0),
		"jmpr"    : parserRel(0x10, 0xd),
		"jmpadd"  : parser(0x12, 0xd, null, null),
		"jmpsub"  : parser(0x11, 0xd, null, null),
		"push"    : parserOne(0xd0, null),
		"pop"     : parserOne(0xc0, null),
		"call"    : parser(0xd0, 0xd, null, 0),
		"callr"   : parserRel(0xd0, 0xd),
		"calladd" : parser(0xd2, 0xd, null, null),
		"callsub" : parser(0xd1, 0xd, null, null),
		"ret"     : parserOne(0xc0, 0xd),
		"iret"    : parserOne(0xe0, 0xd),
		"load"    : parser(0x80, null, null, 0),
		"loadr"   : parserRel(0x80, null),
		"loadadd" : parser(0x82, null, null, null),
		"loadsub" : parser(0x81, null, null, null),
		"store"   : parser(0x90, null, null, 0),
		"storer"  : parserRel(0x90, null),
		"storeadd": parser(0x92, null, null, null),
		"storesub": parser(0x91, null, null, null),
		"cmp"     : parser(0x11, 0xf, null, null)
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instLower = inst.toLowerCase();
		let resultWords = null;
		let warnImmSize = false;
		context.targetData[name].pos = pos;
		if (instLower === "nop") {
			opNumCheck(ops);
			resultWords = [0xc00d];
		} else if (instLower === "worddata") {
			if (ops.length === 0) throw "no data is specified";
			resultWords = [];
			for (let i = 0; i < ops.length; i++) {
				const value = evaluateExpression(ops[i], context);
				if (value === null) {
					resultWords.push(null);
				} else if (!apis.fitsInBitsSigned(value, 16) && !apis.fitsInBitsUnsigned(value, 16)) {
					throw "word out-of-range";
				} else {
					resultWords.push(apis.fromBigInt(value) & 0xffff);
				}
			}
		} else {
			let instName = instLower, immSize = null, flagSuffix = "";
			let usIndex = instLower.indexOf("_");
			if (usIndex >= 0) {
				flagSuffix = instName.substring(usIndex);
				instName = instName.substring(0, usIndex);
			}
			if (instName.substring(instName.length - 1) === "8") {
				immSize = 8;
				instName = instName.substring(0, instName.length - 1);
			} else if (instName.substring(instName.length - 2) === "16") {
				immSize = 16;
				instName = instName.substring(0, instName.length - 2);
			}
			if (!(flagSuffix in flagTable)) return null;
			if (!(instName in parserTable)) return null;
			let parseResult = parserTable[instName](ops, immSize, flagTable[flagSuffix], context);
			warnImmSize = parseResult.warnImmSize;
			resultWords = parseResult.resultWords;
		}
		if (resultWords === null) return null;
		const warnings = [];
		if (warnImmSize) warnings.push("immediate size is specified, but no immediate is used");
		if (pos & apis.toBigInt(1)) {
			if (!("unalignWarnCount" in context.targetData[name])) {
				context.targetData[name].unalignWarnCount = 0;
			}
			const count = ++context.targetData[name].unalignWarnCount;
			if (count <= 10) {
				warnings.push("unaligned instruction");
			}
			if (count === 10) {
				warnings.push("further unaligned instruction warnings will be suppressed");
			}
		}
		const resultWordsBig = [];
		for (let i = 0; i < resultWords.length; i++) {
			resultWordsBig.push(resultWords[i] === null ? null : apis.toBigInt(resultWords[i]));
		}
		return {
			"warnings": warnings,
			"nextPos": pos + apis.toBigInt(2) * apis.toBigInt(resultWordsBig.length),
			"data": resultWordsBig,
			"wordSize": 2
		};
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(nlp16Target);
}
if ((typeof exports) !== "undefined") {
	exports.gmc4Target = nlp16Target;
}
