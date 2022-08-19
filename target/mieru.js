"use strict";

const mieruTarget = (function() {
	const name = "mieru";

	const AT_ALLOW = 0;
	const AT_WARN = 1;
	const AT_ERROR = 2;
	const AT_DEFAULT = AT_WARN;

	const atUsage = function(pos, inst, ops, context) {
		if (ops.length != 1) {
			throw inst + " takes exactly 1 argument.";
		}
		const opLower = ops[0].toLowerCase();
		if (opLower === "allow") context.targetData[name].atUsage = AT_ALLOW;
		else if (opLower === "warn") context.targetData[name].atUsage = AT_WARN;
		else if (opLower === "error") context.targetData[name].atUsage = AT_ERROR;
		else throw "undefined configuration for " + inst + " : " + opLower;
		return {
			"nextPos": pos, "data": [], "wordSize": 0
		};
	};

	const parseRegister = function(reg, context) {
		if (reg.substring(0, 1) === "$"){
			const regLower = reg.substring(1).toLowerCase();
			if (regLower === "at" || regLower === "1") {
				if (context.targetData[name].atUsage === AT_ERROR) {
					throw "explicitly using $at is not allowed";
				}
				return 1;
			} else if (/^[vatsk]?[1-9]?[0-9]$/.test(regLower)) {
				const prefix = regLower.substring(0, 1);
				const value = parseInt(regLower.replace(/[^0-9]/, ""));
				if (prefix === "v") {
					if (value <= 1) return value + 2;
				} else if (prefix === "a") {
					if (value <= 3) return value + 4;
				} else if (prefix === "t") {
					if (value <= 7) return value + 8;
					else if (value <= 9) return value - 8 + 24;
				} else if (prefix === "s") {
					if (value <= 7) return value + 16;
				} else if (prefix === "k") {
					if (value <= 1) return value + 26;
				} else {
					if (value <= 31) return value;
				}
			} else if (regLower === "zero") return 0;
			else if (regLower === "gp") return 28;
			else if (regLower === "sp") return 29;
			else if (regLower === "fp") return 30;
			else if (regLower === "ra") return 31;
		}
		throw "unknown register: " + reg;
	};

	const R_RS = 21, R_RT = 16, R_RD = 11, R_SHAMT = 6;
	const parseR = function(pos, inst, ops, context, opCode, funct, opsPlacement, otherBits) {
		if (typeof otherBits === "undefined") otherBits = 0;
		const apis = context.apis;
		if (ops.length !== opsPlacement.length) {
			throw inst + " takes exactly " + opsPlacement.length + " argument(s)";
		}
		let result = (opCode << 26) | funct | otherBits;
		let resultIsNull = false;
		let warning = null;
		for (let i = 0; i < ops.length; i++) {
			if (opsPlacement[i] > 0) {
				// レジスタとして扱う
				const reg = parseRegister(ops[i], context);
				if (reg === 1 && context.targetData[name].atUsage === AT_WARN) {
					warning = "reserved register $at is used";
				}
				result |= reg << opsPlacement[i];
			} else {
				// 式として扱う
				const rawOperand = apis.evaluate(apis.parse(apis.tokenize(ops[i])), context.vars, context.pass > 1);
				if (rawOperand === null) {
					resultIsNull = true;
				} else if (!apis.fitsInBitsUnsigned(rawOperand, 5)) {
					throw "operand out-of-range";
				} else {
					result |= apis.fromBigInt(rawOperand) << -opsPlacement[i];
				}
			}
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserR = function(opCode, funct, opsPlacement, otherBits) {
		return function(pos, inst, ops, context) {
			return parseR(pos, inst, ops, context, opCode, funct, opsPlacement, otherBits);
		};
	};

	const parserR_rd_rs_rt = function(opCode, funct) {
		return parserR(opCode, funct, [R_RD, R_RS, R_RT]);
	};
	const parserR_rd_rt_rs = function(opCode, funct) {
		return parserR(opCode, funct, [R_RD, R_RT, R_RS]);
	};
	const parserR_mult = function(opCode, funct) {
		const parser3 = parserR(opCode, funct, [R_RD, R_RS, R_RT]);
		const parser2 = parserR(opCode, funct, [R_RS, R_RT]);
		return function(pos, inst, ops, context) {
			if (ops.length === 3) return parser3(pos, inst, ops, context);
			if (ops.length === 2) return parser2(pos, inst, ops, context);
			throw inst + " takes 2 or 3 arguments";
		};
	};
	const parserR_rd_rt_shamt = function(opCode, funct) {
		return parserR(opCode, funct, [R_RD, R_RT, -R_SHAMT]);
	};
	const parserR_jalr = function(opCode, funct) {
		const parser1 = parserR(opCode, funct, [R_RS], 0x1f << R_RD);
		const parser2 = parserR(opCode, funct, [R_RD, R_RS]);
		return function(pos, inst, ops, context) {
			if (ops.length === 1) return parser1(pos, inst, ops, context);
			if (ops.length === 2) return parser2(pos, inst, ops, context);
			throw inst + " takes 1 or 2 arguments";
		};
	};
	const parserR_xi = function(opCode, funct) {
		const extraBits = (0x0b << R_RS) | (0x0c << R_RD);
		const parser0 = parserR(opCode, funct, [], extraBits);
		const parser1 = parserR(opCode, funct, [R_RT], extraBits);
		return function(pos, inst, ops, context) {
			if (ops.length === 0) return parser0(pos, inst, ops, context);
			if (ops.length === 1) return parser1(pos, inst, ops, context);
			throw inst + " takes 0 or 1 arguments";
		};
	};

	const I_RS = 21, I_RT = 16;
	// isSigned が true:符号付きのみ false:符号なしのみ null:符号付き/なし両方OK
	const parseI = function(pos, inst, ops, context, opCode, opsPlacement, isSigned) {
		const apis = context.apis;
		if (ops.length !== opsPlacement.length + 1) {
			throw inst + " takes exactly " + (opsPlacement.length + 1) + " argument(s)";
		}
		let result = opCode << 26;
		let resultIsNull = false;
		let warning = null;
		// レジスタを当てはめる
		for (let i = 0; i < opsPlacement.length; i++) {
			const reg = parseRegister(ops[i], context);
			if (reg === 1 && context.targetData[name].atUsage === AT_WARN) {
				warning = "reserved register $at is used";
			}
			result |= reg << opsPlacement[i];
		}
		// 即値を当てはめる
		const rawImmediate = apis.evaluate(apis.parse(apis.tokenize(ops[ops.length - 1])), context.vars, context.pass > 1);
		if (rawImmediate === null) {
			resultIsNull = true;
		} else if (!(isSigned === null ? apis.fitsInBitsSigned(rawImmediate, 16) || apis.fitsInBitsUnsigned(rawImmediate, 16) :
		(isSigned ? apis.fitsInBitsSigned : apis.fitsInBitsUnsigned)(rawImmediate, 16))) {
			throw "operand out-of-range";
		} else {
			result |= apis.fromBigInt(rawImmediate) & 0xffff;
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserI = function(opCode, opsPlacement, isSigned) {
		return function(pos, inst, ops, context) {
			return parseI(pos, inst, ops, context, opCode, opsPlacement, isSigned);
		};
	};

	const parserI_rt_rs = function(opCode, isSigned) {
		return parserI(opCode, [I_RT, I_RS], isSigned);
	};

	const parseBxx = function(pos, inst, ops, context, opCode) {
		const apis = context.apis;
		if (ops.length !== 3) {
			throw inst + " takes exactly 3 arguments";
		}
		let result = opCode << 26;
		let resultIsNull = false;
		let warning = null;
		// レジスタを当てはめる
		const rs = parseRegister(ops[0], context);
		const rt = parseRegister(ops[1], context);
		if ((rs === 1 || rt === 1) && context.targetData[name].atUsage === AT_WARN) {
			warning = "reserved register $at is used";
		}
		result |= rs << I_RS;
		result |= rt << I_RT;
		// アドレス差を当てはめる
		const rawAddress = apis.evaluate(apis.parse(apis.tokenize(ops[2])), context.vars, context.pass > 1);
		if (rawAddress === null) {
			resultIsNull = true;
		} else if (!apis.fitsInBitsUnsigned(rawAddress, 32)) {
			throw "invalid address";
		} else {
			const rawOffset = rawAddress - (pos + apis.toBigInt(4));
			if (rawOffset % apis.toBigInt(4) != apis.toBigInt(0)) {
				throw "offset is not multiple of 4";
			}
			const offset = rawOffset >> apis.toBigInt(2);
			if (!apis.fitsInBitsSigned(offset, 16)) {
				throw "offset out-of-range";
			} else {
				result |= apis.fromBigInt(offset) & 0xffff;
			}
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserBxx = function(opCode) {
		return function(pos, inst, ops, context) {
			return parseBxx(pos, inst, ops, context, opCode);
		};
	};

	const parseJ = function(pos, inst, ops, context, opCode) {
		const apis = context.apis;
		const addressUpperMask = apis.toBigInt(0xf0000000);
		if (ops.length !== 1) {
			throw inst + " takes exactly 1 argument";
		}
		let result = opCode << 26;
		let resultIsNull = false;
		let warning = null;
		// アドレスを当てはめる
		const rawAddress = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
		if (rawAddress === null) {
			resultIsNull = true;
		} else if (!apis.fitsInBitsUnsigned(rawAddress, 32)) {
			throw "address out-of-range";
		} else if (rawAddress % apis.toBigInt(4) != apis.toBigInt(0)) {
			throw "address is not multiple of 4";
		} else if (((pos + apis.toBigInt(4)) & addressUpperMask) != (rawAddress & addressUpperMask)){
			throw "upper part of address mismatch";
		} else {
			result |= apis.fromBigInt(rawAddress >> apis.toBigInt(2)) & 0x03ffffff;
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserJ = function(opCode) {
		return function(pos, inst, ops, context) {
			return parseJ(pos, inst, ops, context, opCode);
		};
	};

	const parseMem = function(pos, inst, ops, context, opCode) {
		const apis = context.apis;
		if (ops.length !== 2) {
			throw inst + " takes exactly 2 arguments";
		}
		let result = opCode << 26;
		let resultIsNull = false;
		let warning = null;
		// レジスタを当てはめる
		const rsParse = ops[1].match(/^(.*)\([ \t]*([^ \t()]+)[ \t]*\)[ \t]*$/);
		if (rsParse === null) {
			throw "invalid argument";
		}
		const rt = parseRegister(ops[0], context);
		const rs = parseRegister(rsParse[2], context);
		if ((rt === 1 || rs === 1) && context.targetData[name].atUsage === AT_WARN) {
			warning = "reserved register $at is used";
		}
		result |= rt << I_RT;
		result |= rs << I_RS;
		// オフセットを当てはめる
		if (!/^[ \t]*$/.test(rsParse[1])) {
			const rawOffset = apis.evaluate(apis.parse(apis.tokenize(rsParse[1])), context.vars, context.pass > 1);
			if (rawOffset === null) {
				resultIsNull = true;
			} else if (!apis.fitsInBitsSigned(rawOffset, 16)) {
				throw "offset out-of-range";
			} else {
				result |= apis.fromBigInt(rawOffset) & 0xffff;
			}
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserMem = function(opCode) {
		return function(pos, inst, ops, context) {
			return parseMem(pos, inst, ops, context, opCode);
		};
	};

	const parseC = function(pos, inst, ops, context, opCode, funct) {
		const apis = context.apis;
		if (ops.length !== 2 && ops.length !== 3) {
			throw inst + " takes 2 or 3 arguments";
		}
		let result = (opCode << 26) | (funct << 21);
		let resultIsNull = false;
		let warning = null;
		// レジスタを当てはめる
		const rt = parseRegister(ops[0], context);
		if (rt === 1 && context.targetData[name].atUsage === AT_WARN) {
			warning = "reserved register $at is used";
		}
		result |= rt << 16;
		// CP0レジスタを当てはめる
		const rawC0reg = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1,
		function(ast, vars) {
			if (ast.kind === "value" && /^\$[1-9][0-9]*$/.test(ast.value)) {
				return apis.toBigInt(ast.value.substring(1));
			}
			return null;
		});
		if (rawC0reg === null) {
			resultIsNull = true;
		} else if (!apis.fitsInBitsUnsigned(rawC0reg, 5)) {
			throw "invalid CP0 register";
		} else {
			result |= (apis.fromBigInt(rawC0reg) & 0x1f) << 11;
		}
		// selを当てはめる
		if (ops.length >= 3) {
			const rawSel = apis.evaluate(apis.parse(apis.tokenize(ops[2])), context.vars, context.pass > 1);
			if (rawSel === null) {
				resultIsNull = true;
			} else if (!apis.fitsInBitsUnsigned(rawSel, 3)) {
				throw "invalid CP0 sel";
			} else {
				result |= apis.fromBigInt(rawSel) & 0x7;
			}
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserC = function(opCode, funct) {
		return function(pos, inst, ops, context) {
			return parseC(pos, inst, ops, context, opCode, funct);
		};
	};

	const parseE = function(pos, inst, ops, context, opCode, funct, codeLength, codeOffset) {
		const apis = context.apis;
		if (ops.length !== 0 && ops.length !== 1) {
			throw inst + " takes 0 or 1 arguments";
		}
		let result = (opCode << 26) | funct;
		let resultIsNull = false;
		let warning = null;
		// codeを当てはめる
		if (ops.length >= 1) {
			const rawCode = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
			if (rawCode === null) {
				resultIsNull = true;
			} else if (!apis.fitsInBitsUnsigned(rawCode, codeLength)) {
				throw "code out-of-range";
			} else {
				result |= (apis.fromBigInt(rawCode) & ((1 << codeLength) - 1)) << (codeOffset + 6);
			}
		}
		return {
			"nextPos": pos + apis.toBigInt(4),
			"data": [resultIsNull ? null : apis.toBigInt(result)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserE = function(opCode, funct, codeLength, codeOffset) {
		return function(pos, inst, ops, context) {
			return parseE(pos, inst, ops, context, opCode, funct, codeLength, codeOffset);
		};
	};

	const parseLoadImmediatePseudo = function(pos, inst, ops, context, allowSigned) {
		const apis = context.apis;
		if (ops.length !== 2) {
			throw inst + " takes exactly 2 arguments";
		}
		let resultLui = 0x0f << 26, resultOri = 0x0d << 26;
		let resultIsNull = false;
		let warning = null;
		// レジスタを当てはめる
		const rd = parseRegister(ops[0], context);
		if (rd === 1 && context.targetData[name].atUsage === AT_WARN) {
			warning = "reserved register $at is used";
		}
		resultLui |= rd << I_RT;
		resultOri |= (rd << I_RT) | (rd << I_RS);
		// 値を当てはめる
		const rawValue = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
		if (rawValue === null) {
			resultIsNull = true;
		} else if (!apis.fitsInBitsUnsigned(rawValue, 32) && !(allowSigned && apis.fitsInBitsSigned(rawValue, 32))) {
			throw "value out-of-range";
		} else {
			const value = apis.fromBigInt(rawValue);
			resultLui |= (value >> 16) & 0xffff;
			resultOri |= value & 0xffff;
		}
		return {
			"nextPos": pos + apis.toBigInt(8),
			"data": resultIsNull ? [null, null] : [apis.toBigInt(resultLui), apis.toBigInt(resultOri)],
			"wordSize": 4,
			"warning": warning
		};
	};

	const parserLoadImmediatePseudo = function(allowSigned) {
		return function(pos, inst, ops, context) {
			return parseLoadImmediatePseudo(pos, inst, ops, context, allowSigned);
		};
	};

	const parseBranchPseudo = function(pos, inst, ops, context, isReverse, jumpIfTrue) {
		const apis = context.apis;
		if (ops.length !== 3) {
			throw inst + " takes exactly 3 arguments";
		}
		// slt
		const sltOps = isReverse ? [ops[1], ops[0]] : [ops[0], ops[1]];
		const slt = parseR(pos, inst, sltOps, context, 0x00, 0x2a, [R_RS, R_RT]);
		// bxx
		const bxxOpCode = jumpIfTrue ? 0x05 : 0x04;
		const bxx = parseBxx(slt.nextPos, inst, ["$0", "$0", ops[2]], context, bxxOpCode);
		// オペコードを補正する (チェックを避けるために直接入れられない$1を入れる)
		if (slt.data.length !== 1 || bxx.data.length !== 1) {
			throw "internal error: unexpected instruction length";
		}
		let sltData = slt.data[0];
		if (sltData !== null) sltData |= apis.toBigInt(0x01 << R_RD);
		let bxxData = bxx.data[0];
		if (bxxData !== null) bxxData |= apis.toBigInt(0x01 << I_RS);
		// 最終結果を生成する
		const warnings = [];
		if ("warning" in slt && slt.warning !== null) warnings.push(slt.warning);
		if ("warning" in bxx && bxx.warning !== null) warnings.push(bxx.warning);
		return {
			"nextPos": bxx.nextPos,
			"data": [sltData, bxxData],
			"wordSize": 4,
			"warnings": warnings
		};
	};

	const parserBranchPseudo = function(isReverse, jumpIfTrue) {
		return function(pos, inst, ops, context) {
			return parseBranchPseudo(pos, inst, ops, context, isReverse, jumpIfTrue);
		};
	};

	const instructions = {
		// 動作設定
		"at_usage": atUsage,

		// レジスタ演算命令 (乗除算以外)
		"add": parserR_rd_rs_rt(0x00, 0x20),
		"addu": parserR_rd_rs_rt(0x00, 0x21),
		"sub": parserR_rd_rs_rt(0x00, 0x22),
		"subu": parserR_rd_rs_rt(0x00, 0x23),
		"and": parserR_rd_rs_rt(0x00, 0x24),
		"or": parserR_rd_rs_rt(0x00, 0x25),
		"xor": parserR_rd_rs_rt(0x00, 0x26),
		"nor": parserR_rd_rs_rt(0x00, 0x27),
		"sllv": parserR_rd_rt_rs(0x00, 0x04),
		"srlv": parserR_rd_rt_rs(0x00, 0x06),
		"srav": parserR_rd_rt_rs(0x00, 0x07),
		"slt": parserR_rd_rs_rt(0x00, 0x2a),
		"sltu": parserR_rd_rs_rt(0x00, 0x2b),

		// 乗除算命令
		"mult": parserR_mult(0x00, 0x18),
		"multu": parserR_mult(0x00, 0x19),
		"div": parserR(0x00, 0x1a, [R_RS, R_RT]),
		"divu": parserR(0x00, 0x1b, [R_RS, R_RT]),
		"mfhi": parserR(0x00, 0x10, [R_RD]),
		"mflo": parserR(0x00, 0x12, [R_RD]),

		// 即値演算命令
		"lui": parserI(0x0f, [I_RT], null),
		"addi": parserI_rt_rs(0x08, true),
		"addiu": parserI_rt_rs(0x09, true),
		"andi": parserI_rt_rs(0x0c, false),
		"ori": parserI_rt_rs(0x0d, false),
		"xori": parserI_rt_rs(0x0e, false),
		"sll": parserR_rd_rt_shamt(0x00, 0x00),
		"srl": parserR_rd_rt_shamt(0x00, 0x02),
		"sra": parserR_rd_rt_shamt(0x00, 0x03),
		"slti": parserI_rt_rs(0x0a, true),
		"sltiu": parserI_rt_rs(0x0b, true),

		// 分岐命令
		"beq": parserBxx(0x04),
		"bne": parserBxx(0x05),
		"j": parserJ(0x02),
		"jal": parserJ(0x03),
		"jr": parserR(0x00, 0x08, [R_RS]),
		"jalr": parserR_jalr(0x00, 0x09),

		// メモリアクセス命令
		"lb": parserMem(0x20),
		"lbu": parserMem(0x24),
		"lh": parserMem(0x21),
		"lhu": parserMem(0x25),
		"lw": parserMem(0x23),
		"sb": parserMem(0x28),
		"sh": parserMem(0x29),
		"sw": parserMem(0x2b),

		// システム命令
		"mfc0": parserC(0x10, 0x00),
		"mtc0": parserC(0x10, 0x04),
		"ei": parserR_xi(0x10, 0x20),
		"di": parserR_xi(0x10, 0x00),
		"ehb": parserR(0, 0, [], 0x000000c0),
		"eret": parserR(0, 0, [], 0x42000018),
		"break": parserE(0x00, 0x0d, 10, 10),
		"syscall": parserE(0x00, 0x0c, 20, 0),

		// 疑似命令
		"nop": parserR(0x00, 0x00, []),
		"move": parserR(0x00, 0x00, [R_RD, R_RT]),
		"li": parserLoadImmediatePseudo(true),
		"la": parserLoadImmediatePseudo(false),
		"blt": parserBranchPseudo(false, true),
		"bgt": parserBranchPseudo(true, true),
		"ble": parserBranchPseudo(true, false),
		"bge": parserBranchPseudo(false, false),
	};

	const assembleLine = function(pos, inst, ops, context) {
		if (typeof(context.targetData[name].atUsage) === "undefined") {
			context.targetData[name].atUsage = AT_DEFAULT;
		}
		const instLower = inst.toLowerCase();
		if (instLower in instructions) {
			return instructions[instLower](pos, instLower, ops, context);
		} else {
			return null;
		}
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(mieruTarget);
}
if ((typeof exports) !== "undefined") {
	exports.mieruTarget = mieruTarget;
}
