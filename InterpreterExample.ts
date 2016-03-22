/// <reference path="typings/tsd.d.ts"/>
import fs = require("fs");
import MarieInterpreter = require("./public/scripts/Interpreter");
var assembly = fs.readFileSync("../../JS2Marie/compiledAssembly.mas").toString();
var interpreter = new MarieInterpreter.MarieInterpreter(assembly);

function pretty(num: number) {
    if (num < 0) {
		num = 0xFFFFFFFF + num + 1;
    }
	return "0x" + ("0000" + parseInt("" + num).toString(16)).substr(-4) + " "
}

// for (var key in interpreter.symbolTable) {
// 	console.log(key, pretty(interpreter.symbolTable[key]))
// }

// var i = 1;
// while(i < compiler.memory.length + 1) {
// 	process.stdout.write(pretty(compiler.memory[i-1]));
// 	if(i % 16 == 0)
// 		process.stdout.write('\n');
// 	i++
// }
// compiler.inputBuffer = "John\0".split("");

// console.log("AC\tIR\tMAR\tMBR\tPC");

interpreter.onNeedsInputDelegate = ()=>{
	process.stdout.write("> ");
}
interpreter.onExecutionPaused = ()=>{
	// console.log("execution paused...");
}
interpreter.onExecutionResumed = () =>{
	// console.log("resuming execution");
}
interpreter.onExecutionFinished = () =>{
	// console.log("Finished executing");
}
interpreter.onMemoryChangedDelegate = (addr,val)=>{
	// console.log("Address",addr,"changed to",val);
}
interpreter.onOutput = (value:string)=>{
	// console.log("Got output...");
	process.stdout.write(value);
}

process.stdin.on("data", (data) => {
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