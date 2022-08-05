"use strict";

const gmc4Target = (function() {
	const name = "gmc4";

	const opsNoArguments = {
		"KA": 0,
		"AO": 1,
		"CH": 2,
		"CY": 3,
		"AM": 4,
		"MA": 5,
		"M+": 6,
		"M-": 7
	};
	const opsOneArgument = {
		"TIA": 8,
		"AIA": 9,
		"TIY": 0xA,
		"AIY": 0xB,
		"CIA": 0xC,
		"CIY": 0xD
	};
	const calInsts = {
		"RSTO": 0,
		"SETR": 1,
		"RSTR": 2,
		"CMPL": 4,
		"CHNG": 5,
		"SIFT": 6,
		"ENDS": 7,
		"ERRS": 8,
		"SHTS": 9,
		"LONS": 0xA,
		"SUND": 0xB,
		"TIMR": 0xC,
		"DSPR": 0xD,
		"DEM-": 0xE,
		"DEM+": 0xF
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const defaultHexHook = function(ast, vars) {
			if (ast.kind === "value" && /^[0-9a-f]+$/i.test(ast.value)) {
				return apis.toBigInt("0x" + ast.value);
			}
			return null;
		};
		const instUpper = inst.toUpperCase();
		if (instUpper === "DEFAULTHEX") {
			if (ops.length !== 0) {
				throw instUpper + " takes no arguments";
			}
			context.targetData[name].defaultHex = true;
			return {
				"nextPos": pos, "data": [], "wordSize": 0
			};
		} else if (instUpper in opsNoArguments) {
			if (ops.length !== 0) {
				throw instUpper + " takes no arguments";
			}
			const opCode = apis.toBigInt(opsNoArguments[instUpper]);
			return {
				"nextPos": pos + apis.toBigInt(1),
				"data": [opCode],
				"wordSize": 0
			};
		} else if (instUpper in opsOneArgument) {
			if (ops.length !== 1) {
				throw instUpper + " takes one argument";
			}
			const opCode = apis.toBigInt(opsOneArgument[instUpper]);
			const rawOperand = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1,
				context.targetData[name].defaultHex ? defaultHexHook : null);
			if (rawOperand !== null && !apis.fitsInBitsSigned(rawOperand, 4) && !apis.fitsInBitsUnsigned(rawOperand, 4)) {
				throw "operand out-of-range";
			}
			const operand = rawOperand === null ? null : rawOperand & apis.toBigInt(0xf);
			return {
				"nextPos": pos + apis.toBigInt(2),
				"data": [opCode, operand],
				"wordSize": 0
			};
		} else if (instUpper == "CAL") {
			if (ops.length !== 1) {
				throw instUpper + " takes one argument";
			}
			const argUpper = ops[0].toUpperCase();
			if (argUpper in calInsts) {
				const operand = apis.toBigInt(calInsts[argUpper]);
				return {
					"nextPos": pos + apis.toBigInt(2),
					"data": [apis.toBigInt(0xE), operand],
					"wordSize": 0
				};
			} else {
				throw argUpper + " is not defined for " + instUpper;
			}
		} else if (instUpper == "JUMP") {
			if (ops.length !== 1) {
				throw instUpper + " takes one argument";
			}
			const rawOperand = apis.evaluate(apis.parse(apis.tokenize(ops[0])), context.vars, context.pass > 1,
				context.targetData[name].defaultHex ? defaultHexHook : null);
			if (rawOperand !== null && !apis.fitsInBitsUnsigned(rawOperand, 8)) {
				throw "operand out-of-range";
			}
			const operand1 = rawOperand === null ? null : (rawOperand >> apis.toBigInt(4)) & apis.toBigInt(0xf);
			const operand2 = rawOperand === null ? null : rawOperand & apis.toBigInt(0xf);
			return {
				"nextPos": pos + apis.toBigInt(3),
				"data": [apis.toBigInt(0xF), operand1, operand2],
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
	mikeAssembler.registerTarget(gmc4Target);
}
if ((typeof exports) !== "undefined") {
	exports.gmc4Target = gmc4Target;
}
