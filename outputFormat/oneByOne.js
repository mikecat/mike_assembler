"use strict";

const oneByOneOutputFormat = (function() {
	const name = "one-by-one";
	const generateOutput = function(outputParts, outputConfig, apis) {
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
			throw "unknown data format: " + af;
		})();
		const wordSize = outputConfig.wordSize === "auto" ? -1 : parseInt(outputConfig.wordSize);

		const outAddresses = [];
		const outData = [];
		const outLines = [];
		for (let i = 0; i < sortedParts.length; i++) {
			if (sortedParts[i].data.length > 0) {
				const lineWordSize = wordSize < 0 ? sortedParts[i].wordSize : wordSize;
				const maxWordPerLine = (function() {
					const maxBytes = dataRadix === 2 ? 4 : 16;
					const maxWord = lineWordSize === 0 ? maxBytes : ~~(maxBytes / lineWordSize);
					if (dataRadix === 2 && lineWordSize === 0) return maxBytes * 2;
					return maxWord < 1 ? 1 : maxWord;
				})();
				if (lineWordSize > 0 && sortedParts[i].data.length % lineWordSize != 0) {
					message += "line " + sortedParts[i].lineno + ": data size (" + sortedParts[i].data.length + ") is not multiple of word size (" + lineWordSize + ")\n";
				}
				const bytePerWord = lineWordSize <= 0 ? 1 : lineWordSize;
				for (let j = 0; j < sortedParts[i].data.length; j += bytePerWord * maxWordPerLine) {
					const lineWords = [];
					for (let k = 0; k < maxWordPerLine; k++) {
						const startIndex = j + bytePerWord * k;
						if (startIndex >= sortedParts[i].data.length) break;
						let value = apis.toBigInt(0);
						let maxValue = apis.toBigInt(1);
						let endIndex = startIndex + bytePerWord <= sortedParts[i].data.length ? bytePerWord : sortedParts[i].data.length - startIndex;
						for (let l = 0; l < endIndex; l++) {
							const b = sortedParts[i].data[startIndex + (outputConfig.endianness === "big" ? l : endIndex - l - 1)];
							if (b === null) {
								value = null;
							} else if (value !== null) {
								value = value * apis.toBigInt(256) + apis.toBigInt(b);
							}
							maxValue = maxValue * apis.toBigInt(lineWordSize > 0 ? 256 : 16);
						}
						const maxValueStr = (maxValue - apis.toBigInt(1)).toString(dataRadix);
						let valueStr = value === null ? "" : value.toString(dataRadix);
						if (outputConfig.dataFormat === "hexu") valueStr = valueStr.toUpperCase();
						const valuePadding = value === null ? "?" : (dataRadix === 10 ? " " : "0");
						while (valueStr.length < maxValueStr.length) {
							valueStr = valuePadding + valueStr;
						}
						lineWords.push(valueStr);
					}
					outData.push(lineWords.join(" "));
					if (j === 0) {
						const addressStr = sortedParts[i].pos.toString(addressRadix);
						outAddresses.push(outputConfig.addressFormat === "hexu" ? addressStr.toUpperCase() : addressStr);
						outLines.push(sortedParts[i].line);
					} else {
						outAddresses.push("");
						outLines.push("");
					}
				}
			} else {
				outAddresses.push("");
				outData.push("");
				outLines.push(sortedParts[i].line);
			}
		}
		let addressMax = 0, dataMax = 0;
		for (let i = 0; i < outData.length; i++) {
			if (outAddresses[i].length > addressMax) addressMax = outAddresses[i].length;
			if (outData[i].length > dataMax) dataMax = outData[i].length;
		}
		for (let i = 0; i < outData.length; i++) {
			let address = outAddresses[i], data = outData[i];
			const addressPadding = address.length === 0 || addressRadix === 10 ? " " : "0";
			while (address.length < addressMax) {
				address = addressPadding + address;
			}
			while (data.length < dataMax) {
				data += " ";
			}
			output += address + "  " + data + "  " + outLines[i] + "\n";
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
	mikeAssembler.registerOutputFormat(oneByOneOutputFormat);
}
if ((typeof exports) !== "undefined") {
	exports.oneByOneOutputFormat = oneByOneOutputFormat;
}
