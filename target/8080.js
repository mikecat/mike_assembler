"use strict";

const i8080Target = (function() {
	const name = "8080";

	const rm8 = {
		"B": 0,
		"C": 1,
		"D": 2,
		"E": 3,
		"H": 4,
		"L": 5,
		"M": 6,
		"A": 7
	};
	const r16 = {
		"B": 0,
		"D": 1,
		"H": 2,
		"SP": 3
	};
	const r16stack = {
		"B": 0,
		"D": 1,
		"H": 2,
		"PSW": 3
	};
	const r16addr = {
		"B": 0,
		"D": 1
	};

	const insnNoOps = {
		"XCHG": 0xeb,
		"RLC": 0x07,
		"RRC": 0x0f,
		"RAL": 0x17,
		"RAR": 0x1f,
		"CMA": 0x2f,
		"DAA": 0x27,
		"XTHL": 0xe3,
		"SPHL": 0xf9,
		"PCHL": 0xe9,
		"RET": 0xc9,
		"RNZ": 0xc0,
		"RZ": 0xc8,
		"RNC": 0xd0,
		"RC": 0xd8,
		"RPO": 0xe0,
		"RPE": 0xe8,
		"RP": 0xf0,
		"RM": 0xf8,
		"DI": 0xf3,
		"EI": 0xfb,
		"NOP": 0x00,
		"HLT": 0x76,
		"STC": 0x37,
		"CMC": 0x3f,
	};
	const insnRm8 = {
		"INR": {"op": 0x04, "offset": 3},
		"DCR": {"op": 0x05, "offset": 3},
		"ADD": {"op": 0x80, "offset": 0},
		"ADC": {"op": 0x88, "offset": 0},
		"SUB": {"op": 0x90, "offset": 0},
		"SBB": {"op": 0x98, "offset": 0},
		"ANA": {"op": 0xa0, "offset": 0},
		"XRA": {"op": 0xa8, "offset": 0},
		"ORA": {"op": 0xb0, "offset": 0},
		"CMP": {"op": 0xb8, "offset": 0},
	};
	const insnR16 = {
		"DAD": 0x09,
		"INX": 0x03,
		"DCX": 0x0b,
	};
	const insnR16stack = {
		"PUSH": 0xc5,
		"POP": 0xc1,
	};
	const insnR16addr = {
		"STAX": 0x02,
		"LDAX": 0x0a,
	};
	const insnImm8 = {
		"ADI": 0xc6,
		"ACI": 0xce,
		"SUI": 0xd6,
		"SBI": 0xde,
		"ANI": 0xe6,
		"XRI": 0xee,
		"ORI": 0xf6,
		"CPI": 0xfe,
	};
	const insnIaddr8 = {
		"OUT": 0xd3,
		"IN": 0xdb,
	};
	const insnIaddr16 = {
		"STA": 0x32,
		"LDA": 0x3a,
		"SHLD": 0x22,
		"LHLD": 0x2a,
		"JMP": 0xc3,
		"JNZ": 0xc2,
		"JZ": 0xca,
		"JNC": 0xd2,
		"JC": 0xda,
		"JPO": 0xe2,
		"JPE": 0xea,
		"JP": 0xf2,
		"JM": 0xfa,
		"CALL": 0xcd,
		"CNZ": 0xc4,
		"CZ": 0xcc,
		"CNC": 0xd4,
		"CC": 0xdc,
		"CPO": 0xe4,
		"CPE": 0xec,
		"CP": 0xf4,
		"CM": 0xfc,
	};

	const getOneRegOpInsn = function(name, pairStr, opcode, regTable, offset, ops, context) {
		if (ops.length !== 1) throw name + " takes 1 argument";
		const opUpper = ops[0].toUpperCase();
		if (!(opUpper in regTable)) throw "unknown register" + pairStr + ": " + opUpper;
		return [context.apis.toBigInt(opcode | (regTable[opUpper] << offset))];
	};

	const getOneImmOpInsn = function(name, opcode, is16bit, canSigned, ops, context) {
		const apis = context.apis;
		if (ops.length !== 1) throw name + " takes 1 argument";
		const rawOp = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
		const result = [apis.toBigInt(opcode)];
		if (rawOp === null) {
			result.push(null);
			if (is16bit) result.push(null);
		} else {
			const size = is16bit ? 16 : 8;
			if (!apis.fitsInBitsUnsigned(rawOp, size) && !(canSigned && apis.fitsInBitsSigned(rawOp, size))) {
				throw "operand out-of-range";
			}
			result.push(rawOp & apis.toBigInt(0xff));
			if (is16bit) result.push((rawOp >> apis.toBigInt(8)) & apis.toBigInt(0xff));
		}
		return result;
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instUpper = inst.toUpperCase();
		let resultData = null;
		if (instUpper === "MOV") {
			if (ops.length !== 2) throw "MOV takes 2 arguments";
			const regDst = ops[0].toUpperCase(), regSrc = ops[1].toUpperCase();
			if (!(regDst in rm8)) throw "unknown register: " + regDst;
			if (!(regSrc in rm8)) throw "unknown register: " + regSrc;
			const dst = rm8[regDst], src = rm8[regSrc];
			if (dst === 6 && src === 6) throw "MOV M, M is not allowed";
			resultData = [apis.toBigInt(0x40 | (dst << 3) | src)];
		} else if (instUpper === "MVI") {
			if (ops.length !== 2) throw "MVI takes 2 arguments";
			const regDst = ops[0].toUpperCase();
			if (!(regDst in rm8)) throw "unknown register: " + regDst;
			const dst = rm8[regDst];
			const srcValue = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (srcValue !== null && !apis.fitsInBitsSigned(srcValue, 8) && !apis.fitsInBitsUnsigned(srcValue, 8)) {
				throw "operand out-of-range";
			}
			resultData = [
				apis.toBigInt(0x06 | (dst << 3)),
				srcValue === null ? null : srcValue & apis.toBigInt(0xff)
			];
		} else if (instUpper === "LXI") {
			if (ops.length !== 2) throw "LXI takes 2 arguments";
			const regDst = ops[0].toUpperCase();
			if (!(regDst in r16)) throw "unknown register (pair): " + regDst;
			const dst = r16[regDst];
			const srcValue = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (srcValue !== null && !apis.fitsInBitsSigned(srcValue, 16) && !apis.fitsInBitsUnsigned(srcValue, 16)) {
				throw "operand out-of-range";
			}
			resultData = [
				apis.toBigInt(0x01 | (dst << 4)),
				srcValue === null ? null : srcValue & apis.toBigInt(0xff),
				srcValue === null ? null : (srcValue >> apis.toBigInt(8)) & apis.toBigInt(0xff)
			];
		} else if (instUpper === "RST") {
			if (ops.length !== 1) throw "RST takes 1 argument";
			const expValue = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
			if (expValue !== null && !apis.fitsInBitsUnsigned(expValue, 3)) {
				throw "operand out-of-range";
			}
			if (expValue === null) {
				resultData = [null];
			} else {
				resultData = [apis.toBigInt(0xc7) | (expValue << apis.toBigInt(3))];
			}
		} else if (instUpper in insnNoOps) {
			if (ops.length !== 0) throw instUpper + " takes no arguments";
			resultData = [apis.toBigInt(insnNoOps[instUpper])];
		} else if (instUpper in insnRm8) {
			const insnInfo = insnRm8[instUpper];
			resultData = getOneRegOpInsn(instUpper, "", insnInfo.op, rm8, insnInfo.offset, ops, context);
		} else if (instUpper in insnR16) {
			resultData = getOneRegOpInsn(instUpper, " (pair)", insnR16[instUpper], r16, 4, ops, context);
		} else if (instUpper in insnR16stack) {
			resultData = getOneRegOpInsn(instUpper, " pair", insnR16stack[instUpper], r16stack, 4, ops, context);
		} else if (instUpper in insnR16addr) {
			resultData = getOneRegOpInsn(instUpper, " pair", insnR16addr[instUpper], r16addr, 4, ops, context);
		} else if (instUpper in insnImm8) {
			resultData = getOneImmOpInsn(instUpper, insnImm8[instUpper], false, true, ops, context);
		} else if (instUpper in insnIaddr8) {
			resultData = getOneImmOpInsn(instUpper, insnIaddr8[instUpper], false, false, ops, context);
		} else if (instUpper in insnIaddr16) {
			resultData = getOneImmOpInsn(instUpper, insnIaddr16[instUpper], true, false, ops, context);
		}
		if (resultData === null) {
			return null;
		} else {
			return {
				"nextPos": pos + apis.toBigInt(resultData.length),
				"data": resultData,
				"wordSize": 1
			};
		}
	}

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(i8080Target);
}
if ((typeof exports) !== "undefined") {
	exports.i8080Target = i8080Target;
}
