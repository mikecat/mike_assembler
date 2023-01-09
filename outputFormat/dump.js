"use strict";

const dumpOutputFormat = (function() {
	const name = "dump";
	const generateOutput = function(outputParts, outputConfig, context) {
		const apis = context.apis;
		let output = "";
		let message = "";
		const sortedParts = [];
		for (let i = 0; i < outputParts.length; i++) {
			sortedParts.push(outputParts[i]);
		}
		sortedParts.sort(function(a, b) {
			if (a.pos < b.pos) return -1;
			if (a.pos > b.pos) return 1;
			if (a.lineno < b.lineno) return -1;
			if (a.lineno > b.lineno) return 1;
			return 0;
		});

		// 変換設定を読み取る
		const addressRadix = (function() {
			const af = outputConfig.addressFormat;
			if (af === "bin") return 2;
			else if (af === "dec") return 10;
			else if (af === "hexl" || af === "hexu") return 16;
			throw "unknown address format: " + af;
		})();
		const dataRadix = (function() {
			const df = outputConfig.dataFormat;
			if (df === "bin") return 2;
			else if (df === "dec") return 10;
			else if (df === "hexl" || df === "hexu") return 16;
			throw "unknown data format: " + df;
		})();
		const wordSize = (function() {
			if (outputConfig.wordSize !== "auto") return parseInt(outputConfig.wordSize);
			// 変換結果のバイト数が正の行で使われたワードサイズのうち、
			// 優先順位の一番低いものに合わせる
			// 優先順位: ニブル > qword > dword > word > byte
			let minWordSize = 0;
			for (let i = 0; i < sortedParts.length; i++) {
				if (sortedParts[i].data.length > 0) {
					const candidate = sortedParts[i].wordSize;
					if (candidate > 0 && (minWordSize === 0 || candidate < minWordSize)) {
						minWordSize = candidate;
					}
				}
			}
			return minWordSize;
		})();
		const bytePerWord = wordSize === 0 ? 1 : wordSize;
		const bytePerLine = apis.toBigInt(dataRadix === 2 ? 8 : 16);
		const defaultByte = parseInt(outputConfig.defaultByte);
		if (isNaN(defaultByte) || defaultByte < 0 || 0xff < defaultByte) {
			throw "invalid default byte: " + outputConfig.defaultByte;
		}
		const isBigEndian = outputConfig.endianness === "big";
		const addressPadding = addressRadix === 10 ? " " : "0";
		const addressUpperCase = outputConfig.addressFormat === "hexu";
		const dataUpperCase = outputConfig.dataFormat === "hexu";
		const wordPadding = dataRadix === 10 ? " " : "0";
		const digitPerWord = (function() {
			switch (dataRadix) {
				case 2: return wordSize === 0 ? 4 : 8 * wordSize;
				case 16: return wordSize === 0 ? 1 : 2 * wordSize;
				case 10:
					switch (wordSize) {
						case 0: return 2; // 15
						case 1: return 3; // 255
						case 2: return 5; // 65535
						case 4: return 10; // 4294967295
						case 8: return 20; // 18446744073709551615
					}
					break;
			}
			throw "digitPerWord internal error, dataRadix = " + dataRadix + ", wordSize = " + wordSize;
		})();
		const padString = function(str, pad, len) {
			let result = "" + str;
			while (result.length < len) {
				result = pad + result;
			}
			return result;
		};

		// 番兵 (最終行を変換させる)
		if(sortedParts.length > 0) {
			sortedParts.push({
				"line": "",
				"lineno": -1,
				"pos": sortedParts[sortedParts.length - 1].pos + apis.toBigInt(sortedParts[sortedParts.length - 1].data.length) + bytePerLine,
				"data": [0],
				"wordSize": 0,
				"outOption": null
			});
		}

		// 変換を実行する
		let lineAddress = apis.toBigInt(0);
		const lineBuffer = new Array(apis.fromBigInt(bytePerLine));
		const convertedLines = [];
		for (let i = 0; i < lineBuffer.length; i++) lineBuffer[i] = -1;
		for (let i = 0; i < sortedParts.length; i++) {
			if (sortedParts[i].pos < lineAddress) {
				throw "line " + sortedParts[i].lineno + ": data overlaps";
			}
			const data = sortedParts[i].data;
			let dataPos = sortedParts[i].pos;
			for (let i = 0; i < data.length; i++) {
				if (dataPos - lineAddress >= bytePerLine) {
					// 1行分の変換を実行する
					let validDataExists = false;
					let convertedWords = "";
					let wordCount = 0;
					for (let j = 0; j < lineBuffer.length; j += bytePerWord) {
						let value = apis.toBigInt(0);
						let wordValid = false;
						for (let k = 0; k < bytePerWord; k++) {
							value *= apis.toBigInt(0x100);
							const byteValue = lineBuffer[j + (isBigEndian ? k : bytePerWord - 1 - k)];
							const byteValid = 0 <= byteValue && byteValue < 0x100;
							value += apis.toBigInt(byteValid ? byteValue : defaultByte);
							wordValid = wordValid || byteValid;
						}
						validDataExists = validDataExists || wordValid;
						if (wordCount > 0 && wordCount % 4 === 0) convertedWords += " ";
						const convertedWord = padString(wordValid ? value.toString(dataRadix) : "", wordValid ? wordPadding : " ", digitPerWord);
						convertedWords += " ";
						convertedWords += dataUpperCase ? convertedWord.toUpperCase() : convertedWord;
						wordCount++;
					}
					if (validDataExists) {
						if (wordSize > 0) {
							let lastValid = -1;
							for (let j = 0; j < lineBuffer.length; j++) {
								if (0 <= lineBuffer[j] && lineBuffer[j] < 0x100) lastValid = j;
							}
							convertedWords +=" | ";
							for (let j = 0; j <= lastValid; j++) {
								if (lineBuffer[j] < 0) {
									// データなし
									convertedWords +=" ";
								} else if (0x20 <= lineBuffer[j] && lineBuffer[j] < 0x7f) {
									// 印字可能文字
									convertedWords += String.fromCharCode(lineBuffer[j]);
								} else {
									// その他のデータ
									convertedWords += ".";
								}
							}
						}
						convertedLines.push({"address": lineAddress, "data": convertedWords});
					}
					// 行の情報をリセットする
					for (let j = 0; j < lineBuffer.length; j++) lineBuffer[j] = -1;
					lineAddress = dataPos - dataPos % bytePerLine;
				}
				lineBuffer[dataPos % apis.toBigInt(lineBuffer.length)] = data[i];
				dataPos++;
			}
		}

		// アドレスの最大の長さに合わせて、変換を仕上げる
		if (convertedLines.length > 0) {
			const maxAddressLength = convertedLines[convertedLines.length - 1].address.toString(addressRadix).length;
			for (let i = 0; i < convertedLines.length; i++) {
				const addressString = padString(convertedLines[i].address.toString(addressRadix), addressPadding, maxAddressLength);
				output += addressUpperCase ? addressString.toUpperCase() : addressString;
				output += " |" + convertedLines[i].data + "\n";
			}
		}
		return {
			"output": output,
			"message": message
		};
	};
	return {
		"name": name,
		"generateOutput": generateOutput
	};
})();

if ((typeof mikeAssembler) !== "undefined") {
	mikeAssembler.registerOutputFormat(dumpOutputFormat);
}
if ((typeof exports) !== "undefined") {
	exports.dumpOutputFormat = dumpOutputFormat;
}
