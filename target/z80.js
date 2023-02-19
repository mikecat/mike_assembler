"use strict";

const z80Target = (function() {
	const name = "z80";

	const regTable = {
		"r": {
			"B": 0,
			"C": 1,
			"D": 2,
			"E": 3,
			"H": 4,
			"L": 5,
			"A": 7,
		},
		"dd": {
			"BC": 0,
			"DE": 1,
			"HL": 2,
			"SP": 3,
		},
		"qq": {
			"BC": 0,
			"DE": 1,
			"HL": 2,
			"AF": 3,
		},
		"ss": {
			"BC": 0,
			"DE": 1,
			"HL": 2,
			"SP": 3,
		},
		"pp": {
			"BC": 0,
			"DE": 1,
			"IX": 2,
			"SP": 3,
		},
		"rr": {
			"BC": 0,
			"DE": 1,
			"IY": 2,
			"SP": 3,
		},
	};

	const noArgumentsInsts = {
		"EXX": [0xd9],
		"LDI": [0xed, 0xa0],
		"LDIR": [0xed, 0xb0],
		"LDD": [0xed, 0xa8],
		"LDDR": [0xed, 0xb8],
		"CPI": [0xed, 0xa1],
		"CPIR": [0xed, 0xb1],
		"CPD": [0xed, 0xa9],
		"CPDR": [0xed, 0xb9],
		"DAA": [0x27],
		"CPL": [0x2f],
		"NEG": [0xed, 0x44],
		"CCF": [0x3f],
		"SCF": [0x37],
		"NOP": [0x00],
		"HALT": [0x76],
		"DI": [0xf3],
		"EI": [0xfb],
		"RLCA": [0x07],
		"RLA": [0x17],
		"RRCA": [0x0f],
		"RRA": [0x1f],
		"RLD": [0xed, 0x6f],
		"RRD": [0xed, 0x67],
		"RETI": [0xed, 0x4d],
		"RETN": [0xed, 0x45],
		"INI": [0xed, 0xa2],
		"INIR": [0xed, 0xb2],
		"IND": [0xed, 0xaa],
		"INDR": [0xed, 0xba],
		"OUTI": [0xed, 0xa3],
		"OTIR": [0xed, 0xb3],
		"OUTD": [0xed, 0xab],
		"OTDR": [0xed, 0xbb],
	};

	const sOrMInsts = {
		"ADD": {
			"r": {"op": [0x80], "idx": 0, "offset": 0},
			"n": {"op": [0xc6, 0], "idx": 1},
			"HL": {"op": [0x86]},
			"IX": {"op": [0xdd, 0x86, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x86, 0], "idx": 2},
		},
		"ADC": {
			"r": {"op": [0x88], "idx": 0, "offset": 0},
			"n": {"op": [0xce, 0], "idx": 1},
			"HL": {"op": [0x8e]},
			"IX": {"op": [0xdd, 0x8e, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x8e, 0], "idx": 2},
		},
		"SUB": {
			"r": {"op": [0x90], "idx": 0, "offset": 0},
			"n": {"op": [0xd6, 0], "idx": 1},
			"HL": {"op": [0x96]},
			"IX": {"op": [0xdd, 0x96, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x96, 0], "idx": 2},
		},
		"SBC": {
			"r": {"op": [0x98], "idx": 0, "offset": 0},
			"n": {"op": [0xde, 0], "idx": 1},
			"HL": {"op": [0x9e]},
			"IX": {"op": [0xdd, 0x9e, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x9e, 0], "idx": 2},
		},
		"AND": {
			"r": {"op": [0xa0], "idx": 0, "offset": 0},
			"n": {"op": [0xe6, 0], "idx": 1},
			"HL": {"op": [0xa6]},
			"IX": {"op": [0xdd, 0xa6, 0], "idx": 2},
			"IY": {"op": [0xfd, 0xa6, 0], "idx": 2},
		},
		"OR": {
			"r": {"op": [0xb0], "idx": 0, "offset": 0},
			"n": {"op": [0xf6, 0], "idx": 1},
			"HL": {"op": [0xb6]},
			"IX": {"op": [0xdd, 0xb6, 0], "idx": 2},
			"IY": {"op": [0xfd, 0xb6, 0], "idx": 2},
		},
		"XOR": {
			"r": {"op": [0xa8], "idx": 0, "offset": 0},
			"n": {"op": [0xee, 0], "idx": 1},
			"HL": {"op": [0xae]},
			"IX": {"op": [0xdd, 0xae, 0], "idx": 2},
			"IY": {"op": [0xfd, 0xae, 0], "idx": 2},
		},
		"CP": {
			"r": {"op": [0xb8], "idx": 0, "offset": 0},
			"n": {"op": [0xfe, 0], "idx": 1},
			"HL": {"op": [0xbe]},
			"IX": {"op": [0xdd, 0xbe, 0], "idx": 2},
			"IY": {"op": [0xfd, 0xbe, 0], "idx": 2},
		},
		"INC": {
			"r": {"op": [0x04], "idx": 0, "offset": 3},
			"HL": {"op": [0x34]},
			"IX": {"op": [0xdd, 0x34, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x34, 0], "idx": 2},
		},
		"DEC": {
			"r": {"op": [0x05], "idx": 0, "offset": 3},
			"HL": {"op": [0x35]},
			"IX": {"op": [0xdd, 0x35, 0], "idx": 2},
			"IY": {"op": [0xfd, 0x35, 0], "idx": 2},
		},
		"RLC": {
			"r": {"op": [0xcb, 0x00], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x06]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x06], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x06], "idx": 2},
		},
		"RL": {
			"r": {"op": [0xcb, 0x10], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x16]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x16], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x16], "idx": 2},
		},
		"RRC": {
			"r": {"op": [0xcb, 0x08], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x0e]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x0e], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x0e], "idx": 2},
		},
		"RR": {
			"r": {"op": [0xcb, 0x18], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x1e]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x1e], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x1e], "idx": 2},
		},
		"SLA": {
			"r": {"op": [0xcb, 0x20], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x26]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x26], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x26], "idx": 2},
		},
		"SRA": {
			"r": {"op": [0xcb, 0x28], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x2e]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x2e], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x2e], "idx": 2},
		},
		"SRL": {
			"r": {"op": [0xcb, 0x38], "idx": 1, "offset": 0},
			"HL": {"op": [0xcb, 0x3e]},
			"IX": {"op": [0xdd, 0xcb, 0, 0x3e], "idx": 2},
			"IY": {"op": [0xfd, 0xcb, 0, 0x3e], "idx": 2},
		},
	};

	// (IX+d) 的なやつをパースする
	// 引数
	//   ast : パース対象のASTノード
	//   allowedRegs : レジスタとしてとりうる文字列をキーとする連想配列
	//                 値は +d を許可する : true 許可しない : false
	//   context : アセンブラのコンテキスト
	// 戻り値 : 以下の属性を持つオブジェクト、または null (形式がマッチしない場合)
	//   reg : IX のところ (無い場合は属性なし)
	//   disp : +d のところ (無い場合は属性なし、値が確定しない場合に null をとりうる)
	const parseMemory = function(ast, allowedRegs, context) {
		if (ast.kind !== "op" || ast.value !== "()" || ast.children.length !== 1) return null;
		const node1 = ast.children[0];
		if (node1.kind === "value") {
			// (BC) 的なやつ (レジスタ単体) かも
			const regUpper = node1.value.toUpperCase();
			if (regUpper in allowedRegs) {
				return {"reg": regUpper};
			}
		} else if (node1.kind === "op" && (node1.value === "+" || node1.value === "-") && node1.children.length === 2) {
			// (IX+d) 的なやつ (レジスタ + 値) かも
			const regNode = node1.children[0], valueNode = node1.children[1];
			if (regNode.kind === "value") {
				const regUpper = regNode.value.toUpperCase();
				if ((regUpper in allowedRegs) && allowedRegs[regUpper]) {
					let value = context.apis.evaluate(valueNode, context.vars, context.pass > 1);
					if (value !== null && node1.value === "-") value = -value;
					return {"reg": regUpper, "disp": value};
				}
			}
		}
		// (0x1234) とか (hoge) とか (+BC) とか (値単体)
		return {"disp": context.apis.evaluate(node1, context.vars, context.pass > 1)};
	};

	const HLIXdIYd = {"HL": false, "IX": true, "IY": true};

	const assembleLD = (function() {
		const BCDE = {"BC": false, "DE": false};

		return function(ops, context) {
			const apis = context.apis;
			const opUpper1 = ops[0].toUpperCase(), opUpper2 = ops[1].toUpperCase();
			const opParsed1 = apis.parse(apis.tokenize(ops[0])), opParsed2 = apis.parse(apis.tokenize(ops[1]));
			if (opUpper1 === "A") {
				if (opUpper2 === "I") return [0xed, 0x57]; // LD A, I
				if (opUpper2 === "R") return [0xed, 0x5f]; // LD A, R
				const mem = parseMemory(opParsed2, BCDE, context);
				if (mem !== null) {
					if (mem.reg === "BC") return [0x0a]; // LD A, (BC)
					if (mem.reg === "DE") return [0x1a]; // LD A, (DE)
					if ("disp" in mem) {
						// LD A, (nn)
						const nn = mem.disp;
						if (nn !== null && !apis.fitsInBitsUnsigned(nn, 16)) {
							throw "address out-of-range";
						}
						if (nn === null) {
							return [0x3a, null, null];
						} else {
							const nnNumber = apis.fromBigInt(nn);
							return [0x3a, nnNumber & 0xff, (nnNumber >> 8) & 0xff];
						}
					}
				}
			}
			if (opUpper1 in regTable.r) {
				if (opUpper2 in regTable.r) {
					// LD r, r'
					return [0x40 | (regTable.r[opUpper1] << 3) | regTable.r[opUpper2]];
				}
				const mem = parseMemory(opParsed2, HLIXdIYd, context);
				if (mem !== null) {
					if (mem.reg === "HL") {
						// LD r, (HL)
						return [0x46 | (regTable.r[opUpper1] << 3)];
					}
					if (mem.reg === "IX" || mem.reg === "IY") {
						// LD r, (IX+d) / LD r, (IY+d)
						const disp = ("disp" in mem) ? mem.disp : apis.toBigInt(0);
						if (disp !== null && !apis.fitsInBitsSigned(disp, 8)) {
							throw "displacement out-of-range";
						}
						return [
							mem.reg === "IX" ? 0xdd : 0xfd,
							0x46 | (regTable.r[opUpper1] << 3),
							disp === null ? null : apis.fromBigInt(disp) & 0xff
						];
					}
				}
				// LD r, n
				const n = apis.evaluate(opParsed2, context.vars, context.pass > 1);
				if (n !== null && !apis.fitsInBitsSigned(n, 8) && !apis.fitsInBitsUnsigned(n, 8)) {
					throw "value out-of-range";
				}
				return [
					0x06 | (regTable.r[opUpper1] << 3),
					n === null ? null : apis.fromBigInt(n) & 0xff
				];
			}
			if (opUpper2 === "A") {
				if (opUpper1 === "I") return [0xed, 0x47]; // LD I, A
				if (opUpper1 === "R") return [0xed, 0x4f]; // LD R, A
				const mem = parseMemory(opParsed1, BCDE, context);
				if (mem !== null) {
					if (mem.reg === "BC") return [0x02]; // LD (BC), A
					if (mem.reg === "DE") return [0x12]; // LD (DE), A
					if ("disp" in mem) {
						// LD (nn), A
						const nn = mem.disp;
						if (nn !== null && !apis.fitsInBitsUnsigned(nn, 16)) {
							throw "address out-of-range";
						}
						if (nn === null) {
							return [0x32, null, null];
						} else {
							const nnNumber = apis.fromBigInt(nn);
							return [0x32, nnNumber & 0xff, (nnNumber >> 8) & 0xff];
						}
					}
				}
			}
			if (opUpper2 in regTable.r) {
				const mem = parseMemory(opParsed1, HLIXdIYd, context);
				if (mem !== null) {
					if (mem.reg === "HL") {
						// LD (HL), r
						return [0x70 | regTable.r[opUpper2]];
					}
					if (mem.reg === "IX" || mem.reg === "IY") {
						// LD (IX+d), r  / LD (IY+d), r
						const disp = ("disp" in mem) ? mem.disp : apis.toBigInt(0);
						if (disp !== null && !apis.fitsInBitsSigned(disp, 8)) {
							throw "displacement out-of-range";
						}
						return [
							mem.reg === "IX" ? 0xdd : 0xfd,
							0x70 | regTable.r[opUpper2],
							disp === null ? null : apis.fromBigInt(disp) & 0xff
						];
					}
				}
			}
			if (opUpper1 === "SP") {
				if (opUpper2 === "HL") return [0xf9]; // LD SP, HL
				if (opUpper2 === "IX") return [0xdd, 0xf9]; // LD SP, IX
				if (opUpper2 === "IY") return [0xfd, 0xf9]; // LD SP, IY
			}
			if (opUpper1 === "HL" || opUpper1 === "IX" || opUpper1 === "IY" || (opUpper1 in regTable.dd)) {
				const mem = parseMemory(opParsed2, {}, context);
				let opCode = null, nn = null;
				if (mem !== null && ("disp" in mem)) {
					// LD HL, (nn) / LD dd, (nn) / LD IX, (nn) / LD IY, (nn)
					nn = mem.disp;
					if (nn !== null && !apis.fitsInBitsUnsigned(nn, 16)) {
						throw "address out-of-range";
					}
					if (opUpper1 === "HL") opCode = [0x2a];
					else if(opUpper1 in regTable.dd) opCode = [0xed, 0x4b | (regTable.dd[opUpper1] << 4)];
					else if (opUpper1 === "IX") opCode = [0xdd, 0x2a];
					else if (opUpper1 === "IY") opCode = [0xfd, 0x2a];
				} else {
					// LD dd, nn / LD IX, nn / LD IY, nn
					nn = apis.evaluate(opParsed2, context.vars, context.pass > 1);
					if (nn !== null && !apis.fitsInBitsUnsigned(nn, 16) && !apis.fitsInBitsSigned(nn, 16)) {
						throw "value out-of-range";
					}
					if(opUpper1 in regTable.dd) opCode = [0x01 | (regTable.dd[opUpper1] << 4)];
					else if (opUpper1 === "IX") opCode = [0xdd, 0x21];
					else if (opUpper1 === "IY") opCode = [0xfd, 0x21];
				}
				if (opCode !== null) {
					if (nn === null) {
						opCode.push(null);
						opCode.push(null);
					} else {
						const nnNumber = apis.fromBigInt(nn);
						opCode.push(nnNumber & 0xff);
						opCode.push((nnNumber >> 8) & 0xff);
					}
					return opCode;
				}
			}
			if (opUpper2 === "HL" || opUpper2 === "IX" || opUpper2 === "IY" || (opUpper2 in regTable.dd)) {
				const mem = parseMemory(opParsed1, {}, context);
				if (mem !== null && ("disp" in mem)) {
					// LD (nn), HL / LD (nn), dd / LD (nn), IX / LD (nn), IY
					let opCode = null, nn = mem.disp;
					if (nn !== null && !apis.fitsInBitsUnsigned(nn, 16)) {
						throw "address out-of-range";
					}
					if (opUpper2 === "HL") opCode = [0x22];
					else if(opUpper2 in regTable.dd) opCode = [0xed, 0x43 | (regTable.dd[opUpper2] << 4)];
					else if (opUpper2 === "IX") opCode = [0xdd, 0x22];
					else if (opUpper2 === "IY") opCode = [0xfd, 0x22];
					if (nn === null) {
						opCode.push(null);
						opCode.push(null);
					} else {
						const nnNumber = apis.fromBigInt(nn);
						opCode.push(nnNumber & 0xff);
						opCode.push((nnNumber >> 8) & 0xff);
					}
					return opCode;
				}
			}
			const mem = parseMemory(opParsed1, HLIXdIYd, context);
			if (mem !== null) {
				const n = apis.evaluate(opParsed2, context.vars, context.pass > 1);
				if (n !== null && !apis.fitsInBitsUnsigned(n, 8) && !apis.fitsInBitsSigned(n, 8)) {
					throw "value out-of-range";
				}
				const nValue = n === null ? null : apis.fromBigInt(n) & 0xff;
				if (mem.reg === "HL") {
					// LD (HL), n
					return [0x36, nValue];
				}
				if (mem.reg === "IX" || mem.reg === "IY") {
					// LD (IX+d), n  / LD (IY+d), n
					const disp = ("disp" in mem) ? mem.disp : apis.toBigInt(0);
					if (disp !== null && !apis.fitsInBitsSigned(disp, 8)) {
						throw "displacement out-of-range";
					}
					return [
						mem.reg === "IX" ? 0xdd : 0xfd,
						0x36,
						disp === null ? null : apis.fromBigInt(disp) & 0xff,
						nValue
					];
				}
			}
			// その他
			throw "invalid arguments for LD";
		};
	})();

	const assembleSorM = function(name, ops, table, context) {
		const apis = context.apis;
		if (ops.length !== 1) throw name + " takes 1 argument";
		const opUpper = ops[0].toUpperCase();
		if (opUpper in regTable.r) {
			const res = table.r.op.slice(0);
			res[table.r.idx] |= regTable.r[opUpper] << table.r.offset;
			return res;
		}
		const opParsed = apis.parse(apis.tokenize(ops[0]));
		const mem = parseMemory(opParsed, HLIXdIYd, context);
		if (mem !== null) {
			if (mem.reg === "HL") {
				return table.HL.op;
			} else if (mem.reg === "IX" || mem.reg === "IY") {
				const disp = ("disp" in mem) ? mem.disp : apis.toBigInt(0);
				if (disp !== null && !apis.fitsInBitsSigned(disp, 8)) {
					throw "displacement out-of-range";
				}
				const res = table[mem.reg].op.slice(0);
				res[table[mem.reg].idx] = disp === null ? null : apis.fromBigInt(disp) & 0xff;
				return res;
			}
		}
		if ("n" in table) {
			const n = apis.evaluate(opParsed, context.vars, context.pass > 1);
			if (n !== null && !apis.fitsInBitsUnsigned(n, 8) && !apis.fitsInBitsSigned(n, 8)) {
				throw "value out-of-range";
			}
			const res = table.n.op.slice(0);
			res[table.n.idx] = n === null ? null : apis.fromBigInt(n) & 0xff;
			return res;
		}
		throw "invalid argument for " + name;
	};

	const assembleLine = function(pos, inst, ops, context) {
		const apis = context.apis;
		const instUpper = inst.toUpperCase();
		let resultData = null;

		if (instUpper === "LD") {
			if (ops.length !== 2) throw "LD takes 2 arguments";
			resultData = assembleLD(ops, context);
		} else if (instUpper === "PUSH") {
			if (ops.length !== 1) throw "PUSH takes 1 argument";
			const opUpper = ops[0].toUpperCase();
			if (opUpper in regTable.qq) {
				// PUSH qq
				resultData = [0xc5 | (regTable.qq[opUpper] << 4)];
			} else if (opUpper === "IX") resultData = [0xdd, 0xe5]; // PUSH IX
			else if (opUpper === "IY") resultData = [0xfd, 0xe5]; // PUSH IY
			else throw "invalid argument for PUSH";
		} else if (instUpper === "POP") {
			if (ops.length !== 1) throw "POP takes 1 argument";
			const opUpper = ops[0].toUpperCase();
			if (opUpper in regTable.qq) {
				// POP qq
				resultData = [0xc1 | (regTable.qq[opUpper] << 4)];
			} else if (opUpper === "IX") resultData = [0xdd, 0xe1]; // POP IX
			else if (opUpper === "IY") resultData = [0xfd, 0xe1]; // POP IY
			else throw "invalid argument for POP";
		} else if (instUpper === "EX") {
			if (ops.length !== 2) throw "EX takes 2 arguments";
			const op1Upper = ops[0].toUpperCase(), op2Upper = ops[1].toUpperCase();
			if (op1Upper === "DE" && op2Upper === "HL") {
				// EX DE, HL
				resultData = [0xeb];
			} else if (op1Upper === "AF" && op2Upper === "AF'") {
				// EX AF, AF'
				resultData = [0x08];
			} else {
				resultData = null;
				const parsed = apis.parse(apis.tokenize(ops[0]));
				if (parsed.kind === "op" && parsed.value === "()" && parsed.children.length === 1 &&
				parsed.children[0].kind === "value" && parsed.children[0].value.toUpperCase() === "SP") {
					if (op2Upper === "HL") resultData = [0xe3];
					else if (op2Upper === "IX") resultData = [0xdd, 0xe3];
					else if (op2Upper === "IY") resultData = [0xfd, 0xe3];
				}
				if (resultData === null) throw "invalid arguments for EX";
			}
		} else if (instUpper in noArgumentsInsts) {
			resultData = noArgumentsInsts[instUpper];
		} else if (instUpper === "ADD") {
			if (ops.length !== 2) throw "ADD takes 2 arguments";
			const op1Upper = ops[0].toUpperCase(), op2Upper = ops[1].toUpperCase();
			resultData = null;
			if (op1Upper === "A") {
				resultData = assembleSorM(instUpper, [ops[1]], sOrMInsts[instUpper], context);
			} else if (op1Upper === "HL") {
				if (op2Upper in regTable.ss) {
					resultData = [0x09 | (regTable.ss[op2Upper] << 4)];
				}
			} else if (op1Upper === "IX") {
				if (op2Upper in regTable.pp) {
					resultData = [0xdd, 0x09 | (regTable.pp[op2Upper] << 4)];
				}
			} else if (op1Upper === "IY") {
				if (op2Upper in regTable.rr) {
					resultData = [0xfd, 0x09 | (regTable.rr[op2Upper] << 4)];
				}
			}
			if(resultData === null) throw "invalid arguments for ADD";
		} else if (instUpper === "ADC") {
			if (ops.length !== 2) throw "ADC takes 2 arguments";
			const op1Upper = ops[0].toUpperCase(), op2Upper = ops[1].toUpperCase();
			resultData = null;
			if (op1Upper === "A") {
				resultData = assembleSorM(instUpper, [ops[1]], sOrMInsts[instUpper], context);
			} else if (op1Upper === "HL") {
				if (op2Upper in regTable.ss) {
					resultData = [0xed, 0x4a | (regTable.ss[op2Upper] << 4)];
				}
			}
			if(resultData === null) throw "invalid arguments for ADC";
		} else if (instUpper === "SBC") {
			if (ops.length !== 2) throw "SBC takes 2 arguments";
			const op1Upper = ops[0].toUpperCase(), op2Upper = ops[1].toUpperCase();
			resultData = null;
			if (op1Upper === "A") {
				resultData = assembleSorM(instUpper, [ops[1]], sOrMInsts[instUpper], context);
			} else if (op1Upper === "HL") {
				if (op2Upper in regTable.ss) {
					resultData = [0xed, 0x42 | (regTable.ss[op2Upper] << 4)];
				}
			}
			if(resultData === null) throw "invalid arguments for SBC";
		} else if (instUpper === "INC") {
			if (ops.length !== 1) throw "INC takes 1 argument";
			const opUpper = ops[0].toUpperCase();
			resultData = null;
			if (opUpper in regTable.ss) resultData = [0x03 | (regTable.ss[opUpper] << 4)];
			else if (opUpper === "IX") resultData = [0xdd, 0x23];
			else if (opUpper === "IY") resultData = [0xfd, 0x23];
			else resultData = assembleSorM(instUpper, ops, sOrMInsts[instUpper], context);
		} else if (instUpper === "DEC") {
			if (ops.length !== 1) throw "DEC takes 1 argument";
			const opUpper = ops[0].toUpperCase();
			resultData = null;
			if (opUpper in regTable.ss) resultData = [0x0b | (regTable.ss[opUpper] << 4)];
			else if (opUpper === "IX") resultData = [0xdd, 0x2b];
			else if (opUpper === "IY") resultData = [0xfd, 0x2b];
			else resultData = assembleSorM(instUpper, ops, sOrMInsts[instUpper], context);
		} else if (instUpper in sOrMInsts) {
			resultData = assembleSorM(instUpper, ops, sOrMInsts[instUpper], context);
		}

		if (resultData === null) {
			return null;
		} else {
			const dataToReturn = [];
			for (let i = 0; i < resultData.length; i++) {
				if (resultData[i] === null) {
					dataToReturn.push(null);
				} else {
					dataToReturn.push(apis.toBigInt(resultData[i]));
				}
			}
			return {
				"nextPos": pos + apis.toBigInt(dataToReturn.length),
				"data": dataToReturn,
				"wordSize": 1
			};
		}
	};

	return {
		"name": name,
		"assembleLine": assembleLine
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerTarget(z80Target);
}
if ((typeof exports) !== "undefined") {
	exports.z80Target = z80Target;
}
