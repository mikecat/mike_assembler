"use strict";

const td4Target = (function() {
	const name = "td4";

	const operandNumberCheck = function(inst, ops, expectedNumber) {
		if (ops.length !== expectedNumber) {
			throw inst + " takes exactly " + expectedNumber + " argument(s)";
		}
	};

	const parseReg = function(reg) {
		const regUpper = reg.toUpperCase();
		if (regUpper === "A") return 0;
		if (regUpper === "B") return 1;
		return null;
	};

	const parseIm = function(expression, context) {
		if (/^[01]{4}$/.test(expression)) {
			return parseInt(expression, 2);
		} else {
			const apis = context.apis;
			const value = apis.evaluate(apis.parse(apis.tokenize(expression)), context.vars, context.pass > 1);
			if (value === null) return null;
			if (!apis.fitsInBitsSigned(value, 4) && !apis.fitsInBitsUnsigned(value, 4)) {
				throw "immediate value out-of-range";
			}
			return apis.fromBigInt(value) & 0xf;
		}
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instUpper = inst.toUpperCase();
		const reg1 = parseReg(ops.length >= 1 ? ops[0].toUpperCase() : "");
		const reg2 = parseReg(ops.length >= 2 ? ops[1].toUpperCase() : "");
		let opCode = 0;
		if (instUpper === "ADD") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "unknown register: " + ops[0];
			const im = parseIm(ops[1], context);
			if (im === null) opCode = null;
			else opCode = (reg1 === 1 ? 0x50 : 0x00) | im;
		} else if (instUpper === "MOV") {
			operandNumberCheck(instUpper, ops, 2);
			if (reg1 === null) throw "unknown register: " + ops[0];
			if (reg2 === null) {
				const im = parseIm(ops[1], context);
				if (im === null) opCode = null;
				else opCode = (reg1 === 1 ? 0x70 : 0x30) | im;
			} else {
				if (reg1 === 0 && reg2 === 1) opCode = 0x10; // MOV A, B
				else if (reg1 === 1 && reg2 === 0) opCode = 0x40; // MOV B, A
				else throw "undefined operation: " + instUpper + " " +
					ops[0].toUpperCase() + ", " + ops[1].toUpperCase();
			}
		} else if (instUpper === "IN") {
			operandNumberCheck(instUpper, ops, 1);
			if (reg1 === null) throw "unknown register: " + ops[0];
			opCode = reg1 === 1 ? 0x60 : 0x20;
		} else if (instUpper === "OUT") {
			operandNumberCheck(instUpper, ops, 1);
			if (reg1 === null) { // OUT Im
				const im = parseIm(ops[0], context);
				if (im === null) opCode = null;
				else opCode = 0xb0 | im;
			} else if (reg1 === 1) { // OUT B
				opCode = 0x90;
			} else {
				throw "undefined operation: " + instUpper + " " + ops[0].toUpperCase();
			}
		} else if (instUpper === "JMP" || instUpper === "JNC") {
			operandNumberCheck(instUpper, ops, 1);
			const im = parseIm(ops[0], context);
			if (im === null) opCode = null;
			else opCode = (instUpper === "JMP" ? 0xf0 : 0xe0) | im;
		} else {
			return null;
		}
		return {
			"nextPos": pos + apis.toBigInt(1),
			"data": [opCode === null ? null : apis.toBigInt(opCode)],
			"wordSize": 1
		};
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(td4Target);
}
if ((typeof exports) !== "undefined") {
	exports.td4Target = td4Target;
}
