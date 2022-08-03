"use strict";

const ihexFormat = (function() {
	const name = "ihex";
	const generateOutput = function(outputParts, outputConfig, context, apis) {
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

		// 連続したパーツを並べて1個の部分にする
		const mergedParts = [];
		let currentData = [];
		let currentDataStart = sortedParts.length > 0 ? sortedParts[0].pos: apis.toBigInt(0);
		for (let i = 0; i < sortedParts.length; i++) {
			const nextAddress = currentDataStart + apis.toBigInt(currentData.length);
			if (nextAddress != sortedParts[i].pos) {
				if (sortedParts[i].pos < nextAddress) {
					throw "data overlap at line " + sortedParts[i].lineno;
				}
				if (currentData.length > 0) {
					mergedParts.push({"data": currentData, "pos": currentDataStart});
				}
				currentData = [];
				currentDataStart = sortedParts[i].pos;
			}
			for (let j = 0; j < sortedParts[i].data.length; j++) {
				if (sortedParts[i].data[j] === null) {
					if (currentData.length > 0) {
						mergedParts.push({"data": currentData, "pos": currentDataStart});
					}
					currentData = [];
					currentDataStart = sortedParts[i].pos + apis.toBigInt(j + 1);
				} else {
					currentData.push(sortedParts[i].data[j]);
				}
			}
		}
		if (currentData.length > 0) {
			mergedParts.push({"data": currentData, "pos": currentDataStart});
		}

		const addLine = function(type, address, data) {
			const lineData = [];
			if (data.length > 0xff) throw "too long line";
			lineData.push(data.length);
			lineData.push((address >> 8) & 0xff);
			lineData.push(address & 0xff);
			lineData.push(type & 0xff);
			for (let i = 0; i < data.length; i++) {
				lineData.push(data[i] & 0xff);
			}
			let checkSum = 0;
			for (let i = 0; i < lineData.length; i++) {
				checkSum += lineData[i];
			}
			lineData.push((-checkSum) & 0xff);
			let answer = ":";
			for (let i = 0; i < lineData.length; i++) {
				let byteStr = lineData[i].toString(16).toUpperCase();
				while (byteStr.length < 2) byteStr = "0" + byteStr;
				answer += byteStr;
			}
			output += answer + "\n";
		};

		// 並べたデータを書き出す
		let lastHighAddr = 0;
		for (let i = 0; i < mergedParts.length; i++) {
			if (mergedParts[i].pos + apis.toBigInt(mergedParts[i].data.length) > apis.toBigInt("0x100000000")) {
				throw "address larger than 0xffffffff is not supported";
			}
			let currentAddress = apis.fromBigInt(mergedParts[i].pos);
			for (let j = 0; j < mergedParts[i].data.length; ) {
				const highAddr = currentAddress >> 16;
				if (highAddr != lastHighAddr) {
					addLine(0x04, 0, [highAddr >> 8, highAddr & 0xff]);
					lastHighAddr = highAddr;
				}
				const lineAddress = currentAddress & 0xffff;
				const lineData = [];
				do {
					lineData.push(mergedParts[i].data[j]);
				} while (++j < mergedParts[i].data.length && ++currentAddress % 0x10 != 0);
				addLine(0x00, lineAddress, lineData);
			}
		}
		addLine(0x01, 0, []);

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
	mikeAssembler.registerOutputFormat(ihexFormat);
}
if ((typeof exports) !== "undefined") {
	exports.ihexFormat = ihexFormat;
}
