"use strict";
/// <reference path="typings/tsd.d.ts"/>
var fs = require("fs");
var MarieInterpreter = require("./public/scripts/Interpreter");
var assembly = fs.readFileSync("../JS2Marie/compiledAssembly.mas").toString();
var interpreter = new MarieInterpreter.MarieInterpreter(assembly);
function pretty(num) {
    if (num < 0) {
        num = 0xFFFFFFFF + num + 1;
    }
    return "0x" + ("0000" + parseInt("" + num).toString(16)).substr(-4) + " ";
}
// for (var key in interpreter.symbolTable) {
// 	console.log(key, pretty(interpreter.symbolTable[key]))
// }
var i = 1;
while (i < interpreter.memory.length + 1) {
    process.stdout.write(pretty(interpreter.memory[i - 1]));
    if (i % 16 == 0)
        process.stdout.write('\n');
    i++;
}
// interpreter.inputBuffer = "John\0".split("");
// console.log("AC\tIR\tMAR\tMBR\tPC");
interpreter.onNeedsInputDelegate = function () {
    process.stdout.write("> ");
};
interpreter.onExecutionPaused = function () {
    // console.log("execution paused...");
};
interpreter.onExecutionResumed = function () {
    // console.log("resuming execution");
};
interpreter.onExecutionFinished = function () {
    // console.log("Finished executing");
};
interpreter.onMemoryChangedDelegate = function (addr, val) {
    // console.log("Address",addr,"changed to",val);
};
interpreter.onOutput = function (value) {
    // console.log("Got output...");
    process.stdout.write(value);
};
process.stdin.on("data", function (data) {
    interpreter.sendInput(data.toString());
});
interpreter.run();
// console.log(compiler.outputBuffer.map(v => String.fromCharCode(v)));
// var i = 1;
// while (i < compiler.memory.length + 1) {
// 	process.stdout.write(pretty(compiler.memory[i - 1]));
// 	if (i % 16 == 0)
// 		process.stdout.write('\n');
// 	i++
// }
// compiler.memory.map(v => <any>v.toString(16)) 
