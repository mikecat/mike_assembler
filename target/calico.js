"use strict";

const calicoTarget = (function() {
	const name = "calico";

	let immediateTable = null;
	const initializeImmediateTable = function() {
		const moviFuncGen = function(imm) {
			return function(reg) { return 0x20 | (reg << 6) | (imm & 0x0f); };
		};
		const addiFuncGen = function(imm) {
			return function(reg) { return 0x30 | (reg << 6) | (imm & 0x0f); };
		}
		const addiFuncs = {};
		for (let i = -8; i < 8; i++) {
			addiFuncs[i] = addiFuncGen(i);
		}
		const shl1Func = function(reg) { return 0x01 | (reg << 6) | (reg << 2); };
		const shl2Func = function(reg) { return 0x03 | (reg << 6); };
		const shl4Func = function(reg) { return 0x07 | (reg << 6); };
		const shr1Func = function(reg) { return 0x0b | (reg << 6); };
		const shr2Func = function(reg) { return 0x0f | (reg << 6); };
		const notFunc  = function(reg) { return 0x02 | (reg << 6) | (reg << 2); };

		// 各数値の作り方を幅優先探索する
		const nextFunction = [], nextValue = [], q = [];
		for (let i = 0; i < 16; i++) {
			nextFunction.push(moviFuncGen(i));
			nextValue.push(-1);
			q.push(i);
		}
		for (let i = 16; i < 256; i++) {
			nextFunction.push(null);
			nextValue.push(null);
		}
		const attempt = function(func, cur, next) {
			if (nextValue[next] == null) {
				nextFunction[next] = func;
				nextValue[next] = cur;
				q.push(next);
			}
		};
		while (q.length > 0) {
			const cur = q.shift();
			for (let delta = -8; delta < 8; delta++) {
				attempt(addiFuncs[delta], cur, (cur + delta) & 0xff);
			}
			attempt(shl1Func, cur, (cur << 1) & 0xff);
			attempt(shl2Func, cur, (cur << 2) & 0xff);
			attempt(shl4Func, cur, (cur << 4) & 0xff);
			attempt(shr1Func, cur, (cur >> 1) & 0xff);
			attempt(shr2Func, cur, (cur >> 2) & 0xff);
			attempt(notFunc, cur, (~cur) & 0xff);
		}
		// 経路復元をする
		immediateTable = [];
		for (let i = 0; i < 256; i++) {
			const functions = [];
			let cur = i;
			while (cur >= 0) {
				functions.unshift(nextFunction[cur]);
				cur = nextValue[cur];
			}
			immediateTable.push(functions);
		}
	};

	const rdRsInstructions = {
		"MOV": 0x00,
		"ADD": 0x01,
		"NAND": 0x02,
		"JAL": 0x11,
		"JNZ": 0x13
	};

	const operandNumberCheck = function(inst, ops, expectedNumber) {
		if (ops.length !== expectedNumber) {
			throw inst + " takes exactly " + expectedNumber + " argument(s)";
		}
	};

	const parseRegister = function(reg) {
		const regUpper = reg.toUpperCase();
		if (regUpper === "A") return 0;
		if (regUpper === "B") return 1;
		if (regUpper === "C") return 2;
		if (regUpper === "D") return 3;
		return null;
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instUpper = inst.toUpperCase();
		const reg1 = parseRegister(ops.length >= 1 ? ops[0] : "");
		const reg2 = parseRegister(ops.length >= 2 ? ops[1] : "");
		const opCodes = [];

		if (instUpper in rdRsInstructions) {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			if (reg2 === null) throw "invalid register name: " + ops[1];
			opCodes.push(rdRsInstructions[instUpper] | (reg1 << 6) | (reg2 << 2));
		} else if (instUpper === "MOVP") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg2 === null) {
				// MOVP rd, preg
				if (reg1 === null) throw "invalid register name: " + ops[0];
				let xp = 0;
				const reg2Upper = ops[1].toUpperCase();
				if (reg2Upper === "P0IN") xp = 0;
				else if (reg2Upper === "P0OUT") xp = 1;
				else if (reg2Upper === "P1IN") xp = 2;
				else if (reg2Upper === "P1OUT") xp = 3;
				else throw "invalid port register name: " + ops[1];
				opCodes.push(0x10 | (reg1 << 6) | (xp << 2));
			} else {
				// MOVP preg, rd
				let xp = 0;
				const reg1Upper = ops[0].toUpperCase();
				if (reg1Upper === "P0OUT") xp = 0;
				else if (reg1Upper === "P0DRIVE") xp = 1;
				else if (reg1Upper === "P1OUT") xp = 2;
				else if (reg1Upper === "P1DRIVE") xp = 3;
				else throw "invalid port register name: " + ops[0];
				opCodes.push(0x12 | (reg2 << 6) | (xp << 2));
			}
		} else if (instUpper === "ADDI") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			const rawImm = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (rawImm === null) {
				opCodes.push(null);
			} else if (apis.fitsInBitsSigned(rawImm, 4)) {
				opCodes.push(0x30 | (reg1 << 6) | (apis.fromBigInt(rawImm) & 0x0f));
			} else {
				throw "immediate out-of-range";
			}
		} else if (instUpper === "NOP") {
			operandNumberCheck(instUpper, ops, 0);
			opCodes.push(0x00);
		} else if (/^SH(L[123]?|R[1234]?)$/.test(instUpper)) {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			const rawImm = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (rawImm === null) {
				opCodes.push(null);
			} else if (rawImm === apis.toBigInt(8)) {
				opCodes.push(0x20 | (reg1 << 6)); // MOVI1 rd, 0
			} else if (!apis.fitsInBitsUnsigned(rawImm, 3)) {
				throw "width out-of-range";
			} else {
				const imm = apis.fromBigInt(rawImm);
				if (instUpper.substring(2, 3) === "L") {
					if (imm & 4) opCodes.push(0x07 | (reg1 << 6)); // SHL1 rd, 4
					if (imm & 2) opCodes.push(0x03 | (reg1 << 6)); // SHL1 rd, 2
					if (imm & 1) opCodes.push(0x01 | (reg1 << 6) | (reg1 << 2)); // ADD rd, rd
				} else {
					for (let i = 1; i < imm; i += 2) {
						opCodes.push(0x0f | (reg1 << 6)); // SHR1 rd, 2
					}
					if (imm & 1) opCodes.push(0x0b | (reg1 << 6)); // SHR1 rd, 1
				}
			}
			const numInstStr = instUpper.substring(3);
			if (numInstStr.length > 0) {
				const numInst = parseInt(numInstStr);
				if (opCodes.length > numInst) throw "operation doesn't fit in " + numInst + " instructions";
				while (opCodes.length < numInst) {
					opCodes.push(rawImm === null ? null : 0x00); // NOP
				}
			}
		} else if (instUpper === "IN") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			const rawx = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (rawx === null) {
				opCodes.push(null);
			} else if (apis.fitsInBitsUnsigned(rawx, 1)) {
				opCodes.push(0x10 | (reg1 << 6) | (apis.fromBigInt(rawx) << 3));
			} else {
				throw "invalid port";
			}
		} else if (instUpper === "OUT" || instUpper === "DRIVE") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg2 === null) throw "invalid register name: " + ops[1];
			const rawx = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
			if (rawx === null) {
				opCodes.push(null);
			} else if (apis.fitsInBitsUnsigned(rawx, 1)) {
				const isDrive = instUpper === "DRIVE" ? 1 : 0;
				opCodes.push(0x12 | (reg2 << 6) | (apis.fromBigInt(rawx) << 3) | (isDrive << 2));
			} else {
				throw "invalid port";
			}
		} else if (instUpper === "NOT") {
			operandNumberCheck(instUpper, ops, 1);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			opCodes.push(0x02 | (reg1 << 6) | (reg1 << 2)); // NAND rd, rd
		} else if (instUpper === "AND" || instUpper === "OR" || instUpper === "OR!") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			if (reg2 === null) throw "invalid register name: " + ops[1];
			if (reg1 === reg2) throw "using same registers is not allowed";
			if (instUpper === "AND") {
				opCodes.push(0x02 | (reg1 << 6) | (reg2 << 2)); // NAND rd, rs
				opCodes.push(0x02 | (reg1 << 6) | (reg1 << 2)); // NAND rd, rd
			} else {
				opCodes.push(0x02 | (reg1 << 6) | (reg1 << 2)); // NAND rd, rd
				opCodes.push(0x02 | (reg2 << 6) | (reg2 << 2)); // NAND rs, rs
				opCodes.push(0x02 | (reg1 << 6) | (reg2 << 2)); // NAND rd, rs
				if (instUpper !== "OR!") {
					opCodes.push(0x02 | (reg2 << 6) | (reg2 << 2)); // NAND rs, rs
				}
			}
		} else if (instUpper === "XOR") {
			operandNumberCheck(instUpper, ops, 3);
			const reg3 = parseRegister(ops[2]);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			if (reg2 === null) throw "invalid register name: " + ops[1];
			if (reg3 === null) throw "invalid register name: " + ops[2];
			if (reg1 === reg2 || reg2 === reg3 || reg3 === reg1) {
				throw "using same registers is not allowed";
			}
			opCodes.push(0x00 | (reg3 << 6) | (reg1 << 2)); // MOV rt, rd
			opCodes.push(0x02 | (reg3 << 6) | (reg2 << 2)); // NAND rt, rs
			opCodes.push(0x02 | (reg1 << 6) | (reg3 << 2)); // NAND rd, rt
			opCodes.push(0x02 | (reg3 << 6) | (reg2 << 2)); // NAND rt, rs
			opCodes.push(0x02 | (reg1 << 6) | (reg3 << 2)); // NAND rd, rt
		} else if (/^MOVI[123]?$/.test(instUpper)) {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "invalid register name: " + ops[0];
			const rawImm = apis.evaluate(apis.parse(apis.tokenize(ops[1])), context.vars, context.pass > 1);
			if (rawImm === null) {
				opCodes.push(null);
			} else if (!apis.fitsInBitsUnsigned(rawImm, 8) && !apis.fitsInBitsSigned(rawImm, 8)) {
				throw "immediate out-of-range";
			} else {
				const imm = apis.fromBigInt(rawImm) & 0xff;
				if (immediateTable === null) initializeImmediateTable();
				const immediateOps = immediateTable[imm];
				for (let i = 0; i < immediateOps.length; i++) {
					opCodes.push(immediateOps[i](reg1));
				}
			}
			const numInstStr = instUpper.substring(4);
			if (numInstStr.length > 0) {
				const numInst = parseInt(numInstStr);
				if (opCodes.length > numInst) throw "operation doesn't fit in " + numInst + " instructions";
				while (opCodes.length < numInst) {
					opCodes.push(rawImm === null ? null : 0x00); // NOP
				}
			}
		}

		const opCodesConverted = [];
		for (let i = 0; i < opCodes.length; i++) {
			opCodesConverted.push(opCodes[i] === null ? null : apis.toBigInt(opCodes[i]));
		}
		return {
			"nextPos": pos + apis.toBigInt(opCodesConverted.length),
			"data": opCodesConverted,
			"wordSize": 1
		};
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(calicoTarget);
}
if ((typeof exports) !== "undefined") {
	exports.calicoTarget = calicoTarget;
}
