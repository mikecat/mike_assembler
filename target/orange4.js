"use strict";

const orange4Target = (function() {
	const name = "orange4";

	const opsNoArguments = {
		"ink": 0,
		"outn": 1,
		"abyz": 2,
		"ay": 3,
		"st": 4,
		"ld": 5,
		"add": 6,
		"sub": 7,
		"ret": 0xF61,
		"pusha": 0xF62,
		"popa": 0xF63,
		"pushb": 0xF64,
		"popb": 0xF65,
		"pushy": 0xF66,
		"popy": 0xF67,
		"pushz": 0xF68,
		"popz": 0xF69,
		"ioctrl": 0xF70,
		"out": 0xF71,
		"in": 0xF72
	};
	const opsOneArgument = {
		"ldi": 8,
		"addi": 9,
		"ldyi": 0xA,
		"addyi": 0xB,
		"cpi": 0xC,
		"cpyi": 0xD,
		"scall": 0xE
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instLower = inst.toLowerCase();
		if (instLower in opsNoArguments) {
			if (ops.length !== 0) {
				throw instUpper + " takes no arguments";
			}
			const op = opsNoArguments[instLower];
			let opArray;
			if (op < 0x10) {
				opArray = [apis.toBigInt(op)];
			} else {
				opArray = [apis.toBigInt((op >> 8) & 0xf), apis.toBigInt((op >> 4) & 0xf), apis.toBigInt(op & 0xf)];
			}
			return {
				"nextPos": pos + apis.toBigInt(opArray.length),
				"data": opArray,
				"wordSize": 0
			};
		} else if (instLower in opsOneArgument || instLower === "dn") {
			if (ops.length !== 1) {
				throw instUpper + " takes one argument";
			}
			const op = instLower === "dn" ? [] : [apis.toBigInt(opsOneArgument[instLower])];
			const rawOperand = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
			if (rawOperand !== null && (instLower === "scall" || !apis.fitsInBitsSigned(rawOperand, 4)) && !apis.fitsInBitsUnsigned(rawOperand, 4)) {
				throw "operand out-of-range";
			}
			op.push(rawOperand === null ? null : rawOperand & apis.toBigInt(0xf));
			return {
				"nextPos": pos + apis.toBigInt(op.length),
				"data": op,
				"wordSize": 0
			};
		} else if (instLower === "jmpf" || instLower ==="call") {
			if (ops.length !== 1) {
				throw instUpper + " takes one argument";
			}
			const rawOperand = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1);
			if (rawOperand !== null && !apis.fitsInBitsUnsigned(rawOperand, 8)) {
				throw "operand out-of-range";
			}
			const op = [apis.toBigInt(0xF)];
			if (instLower === "call") {
				op.push(apis.toBigInt(6));
				op.push(apis.toBigInt(0));
			}
			op.push(rawOperand === null ? null : (rawOperand >> apis.toBigInt(4)) & apis.toBigInt(0xf));
			op.push(rawOperand === null ? null : rawOperand & apis.toBigInt(0xf));
			return {
				"nextPos": pos + apis.toBigInt(op.length),
				"data": op,
				"wordSize": 0
			};
		}
		return null;
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(orange4Target);
}
if ((typeof exports) !== "undefined") {
	exports.orange4Target = orange4Target;
}
