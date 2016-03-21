"use strict";
var Opcode;
(function (Opcode) {
    Opcode[Opcode["JNS"] = 0] = "JNS";
    Opcode[Opcode["LOAD"] = 1] = "LOAD";
    Opcode[Opcode["STORE"] = 2] = "STORE";
    Opcode[Opcode["ADD"] = 3] = "ADD";
    Opcode[Opcode["SUBT"] = 4] = "SUBT";
    Opcode[Opcode["INPUT"] = 5] = "INPUT";
    Opcode[Opcode["OUTPUT"] = 6] = "OUTPUT";
    Opcode[Opcode["HALT"] = 7] = "HALT";
    Opcode[Opcode["SKIPCOND"] = 8] = "SKIPCOND";
    Opcode[Opcode["JUMP"] = 9] = "JUMP";
    Opcode[Opcode["CLEAR"] = 10] = "CLEAR";
    Opcode[Opcode["ADDI"] = 11] = "ADDI";
    Opcode[Opcode["JUMPI"] = 12] = "JUMPI";
    Opcode[Opcode["LOADI"] = 13] = "LOADI";
    Opcode[Opcode["STOREI"] = 14] = "STOREI";
    Opcode[Opcode["ORG"] = 20] = "ORG";
    Opcode[Opcode["HEX"] = 21] = "HEX";
    Opcode[Opcode["DEC"] = 22] = "DEC";
})(Opcode || (Opcode = {}));
var MarieInterpreter = (function () {
    function MarieInterpreter(instructions) {
        this.Accumulator = 0x0000;
        this.InstructionRegister = 0x0000;
        this.MemoryAddressRegister = 0x0000;
        this.MemoryBufferRegister = 0x0000;
        this.ProgramCounter = 0x0000;
        this.Input = 0x0000;
        this.isRunning = true;
        this.isWaitingOnInput = false;
        this.isFinishedExecuting = false;
        this.org = 0;
        this.outputBuffer = new Array();
        this.inputBuffer = new Array();
        this.delayInMS = 0;
        var objects = this.convertToObjects(instructions);
        if (objects[0] && objects[0].opcode.toUpperCase() == "ORG") {
            this.org = Number(objects[0].param);
            this.ProgramCounter = this.org;
        }
        // console.log(objects);
        this.symbolTable = this.buildSymbolTable(objects);
        this.instructions = this.assemble(objects);
        this.memory = this.fillMemory(this.instructions);
    }
    MarieInterpreter.prototype.buildSymbolTable = function (instructions) {
        var map = {};
        for (var i = 0; i < instructions.length; i++) {
            if (instructions[i].label)
                map[instructions[i].label] = i;
        }
        return map;
    };
    MarieInterpreter.prototype.assemble = function (instructions) {
        for (var i = 0; i < instructions.length; i++) {
            if (this.symbolTable[instructions[i].param] != undefined) {
                instructions[i].param = this.symbolTable[instructions[i].param];
            }
            var opcode = Opcode[("" + instructions[i].opcode).toUpperCase()]; //this.opcodeStringToOpcode(<any>instructions[i].opcode);
            if (opcode === undefined)
                throw new Error("Invalid Instruction " + JSON.stringify(instructions[i]));
            else
                instructions[i].opcode = opcode;
        }
        return instructions;
    };
    MarieInterpreter.prototype.convertToObjects = function (instructions) {
        var ins = [];
        instructions = instructions.replace("\r\n", "\n");
        instructions = instructions.replace("\r", "\n");
        instructions = instructions.replace("\n+", "\n");
        instructions = instructions.replace(/\t+/g, " ");
        instructions = instructions.trim();
        // console.log(instructions);
        var lines = instructions.split("\n");
        lines.forEach(function (line) {
            line = line.trim();
            if (!line)
                return;
            var i = { opcode: null };
            if (line.indexOf(",") != -1) {
                var split = line.split(",");
                i.label = split[0].trim();
                line = split[1];
            }
            line = line.trim(); //line.replace(/(^\ )+/g, "");
            var split = line.split(" ");
            i.opcode = split[0];
            if (split.length >= 2)
                i.param = split[1];
            ins.push(i);
        });
        return ins;
    };
    MarieInterpreter.prototype.fillMemory = function (instructions) {
        var memory = new Int16Array(1 << 11);
        for (var i = this.org; i < instructions.length + this.org; i++) {
            if (instructions[i].opcode == Opcode.DEC) {
                memory[i] = parseInt("" + instructions[i].param, 10) & 0xFFFF;
            }
            else if (instructions[i].opcode == Opcode.HEX) {
                memory[i] = parseInt("" + instructions[i].param, 16) & 0xFFFF;
            }
            else if (instructions[i].opcode == Opcode.SKIPCOND) {
                memory[i] = (instructions[i].opcode & 0xF) << 12;
                memory[i] |= parseInt("" + instructions[i].param, 16) & 0x0FFF;
            }
            else {
                memory[i] = (instructions[i].opcode & 0xF) << 12;
                memory[i] |= instructions[i].param & 0x0FFF;
            }
        }
        return memory;
    };
    MarieInterpreter.prototype.setMemory = function () {
        this.memory[this.MemoryAddressRegister] = this.MemoryBufferRegister;
        if (this.onMemoryChangedDelegate)
            this.onMemoryChangedDelegate(this.MemoryAddressRegister, this.MemoryBufferRegister);
    };
    MarieInterpreter.prototype.getMemory = function () {
        this.MemoryBufferRegister = this.memory[this.MemoryAddressRegister];
    };
    MarieInterpreter.prototype.getInput = function () {
        if (this.inputBuffer.length > 0) {
            var value = this.inputBuffer.splice(0, 1)[0];
            // console.log("Getting input!",this.inputBuffer,value);
            if (typeof (value) == "string") {
                value = value.charCodeAt(0);
            }
            this.Accumulator = value;
        }
        else {
            this.isWaitingOnInput = true;
            if (this.onNeedsInputDelegate)
                this.onNeedsInputDelegate();
        }
    };
    MarieInterpreter.prototype.sendInput = function (input) {
        this.inputBuffer = this.inputBuffer.concat(input.split("")).concat([0]);
        if (this.inputBuffer.length > 0 && this.isWaitingOnInput) {
            // console.log("Got the input i've been waiting for. Resuming.");
            this.getInput();
            this.isWaitingOnInput = false;
        }
    };
    MarieInterpreter.prototype.pauseExecution = function () {
        this.isRunning = false;
        if (this.onExecutionPaused)
            this.onExecutionPaused();
    };
    MarieInterpreter.prototype.resumeExecution = function () {
        this.isRunning = true;
        if (this.onExecutionResumed)
            this.onExecutionResumed();
    };
    MarieInterpreter.prototype.step = function () {
        // console.log(this.isRunning, this.isFinishedExecuting, this.isWaitingOnInput);
        if (!this.isWaitingOnInput) {
            this.MemoryAddressRegister = this.ProgramCounter;
            this.InstructionRegister = this.memory[this.MemoryAddressRegister];
            this.ProgramCounter++;
            this.interpret();
        }
    };
    MarieInterpreter.prototype.run = function () {
        // console.log("running...",this.isRunning);
        if (!this.isWaitingOnInput && this.isRunning && !this.isFinishedExecuting)
            this.step();
        if (this.isRunning && !this.isFinishedExecuting)
            if (this.delayInMS == 0)
                setImmediate(this.run.bind(this));
            else
                setTimeout(this.run.bind(this), this.delayInMS);
    };
    MarieInterpreter.prototype.interpret = function () {
        var opcode = (this.InstructionRegister & 0xF000) >> 12;
        var param = this.InstructionRegister & 0x0FFF;
        // console.log(opcode,param);
        switch (opcode) {
            case Opcode.JNS:
                this.MemoryBufferRegister = this.ProgramCounter;
                this.MemoryAddressRegister = param;
                this.setMemory();
                this.ProgramCounter = param + 1;
                break;
            case Opcode.LOAD:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.Accumulator = this.MemoryBufferRegister;
                break;
            case Opcode.STORE:
                this.MemoryAddressRegister = param;
                this.MemoryBufferRegister = this.Accumulator;
                this.setMemory();
                break;
            case Opcode.ADD:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.Accumulator += this.MemoryBufferRegister;
                break;
            case Opcode.SUBT:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.Accumulator -= this.MemoryBufferRegister;
                break;
            case Opcode.INPUT:
                this.getInput();
                break;
            case Opcode.OUTPUT:
                this.outputBuffer.push(this.Accumulator);
                if (this.onOutput)
                    this.onOutput(String.fromCharCode(this.Accumulator));
                break;
            case Opcode.HALT:
                this.isFinishedExecuting = true;
                this.pauseExecution();
                if (this.onExecutionFinished)
                    this.onExecutionFinished();
                break;
            case Opcode.SKIPCOND:
                if (param == 0x800 && this.Accumulator > 0) {
                    // console.log(this.Accumulator,"> 0")
                    this.ProgramCounter++;
                }
                else if (param == 0x400 && this.Accumulator == 0) {
                    // console.log(this.Accumulator,"== 0")
                    this.ProgramCounter++;
                }
                else if (param == 0x000 && this.Accumulator < 0) {
                    // console.log(this.Accumulator,"< 0")
                    this.ProgramCounter++;
                }
                break;
            case Opcode.JUMP:
                this.ProgramCounter = param;
                break;
            case Opcode.CLEAR:
                this.Accumulator = 0;
                break;
            case Opcode.ADDI:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.MemoryAddressRegister = this.MemoryBufferRegister & 0x0FFF;
                this.getMemory();
                this.Accumulator += this.MemoryBufferRegister & 0xFFFF;
                break;
            case Opcode.JUMPI:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.ProgramCounter = this.MemoryBufferRegister & 0x0FFF;
                break;
            case Opcode.LOADI:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.MemoryAddressRegister = this.MemoryBufferRegister & 0x0FFF;
                this.getMemory();
                this.Accumulator = this.MemoryBufferRegister;
                break;
            case Opcode.STOREI:
                this.MemoryAddressRegister = param;
                this.getMemory();
                this.MemoryAddressRegister = this.MemoryBufferRegister & 0x0FFF;
                this.MemoryBufferRegister = this.Accumulator;
                this.setMemory();
                break;
        }
    };
    return MarieInterpreter;
}());
exports.MarieInterpreter = MarieInterpreter;
//# sourceMappingURL=Interpreter.js.map