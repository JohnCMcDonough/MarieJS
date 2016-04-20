enum Opcode {
    JNS = 0,
    LOAD = 1,
    STORE = 2,
    ADD = 3,
    SUBT = 4,
    INPUT = 5,
    OUTPUT = 6,
    HALT = 7,
    SKIPCOND = 8,
    JUMP = 9,
    CLEAR = 10,
    ADDI = 11,
    JUMPI = 12,
    LOADI = 13,
    STOREI = 14,
    ORG = 20,
    HEX = 21,
    DEC = 22,
}

interface Instruction {
    opcode: Opcode;
    label?: string,
    param?: number
    linenumber: number
}

class CompilerError {
    constructor(public lineNumber: number, public errorstring: string, public object: string) {
    }
}

function ToInteger(x) {
    x = Number(x);
    return x < 0 ? Math.ceil(x) : Math.floor(x);
}
function modulo(a, b) {
    return a - Math.floor(a / b) * b;
}

function ToUint32(x) {
    return modulo(ToInteger(x), Math.pow(2, 32));
}

function ToInt32(x) {
    var uint32 = ToUint32(x);
    if (uint32 >= Math.pow(2, 31)) {
        return uint32 - Math.pow(2, 32)
    } else {
        return uint32;
    }
}

function ToUint16(x) {
    return modulo(ToInteger(x), Math.pow(2, 16));
}

function ToInt16(x) {
    var uint32 = ToUint32(x);
    if (uint32 >= Math.pow(2, 15)) {
        return uint32 - Math.pow(2, 16)
    } else {
        return uint32;
    }
}

class MarieInterpreter {

    public Accumulator = 0x0000;
    public InstructionRegister: Opcode = 0x0000;
    public MemoryAddressRegister = 0x0000;
    public MemoryBufferRegister = 0x0000;
    public ProgramCounter = 0x0000;
    public Input = 0x0000;

    public isRunning = false;
    public isWaitingOnInput = false;
    public isFinishedExecuting = true;
    public symbolTable: { [label: string]: number };
    public instructions: Array<Instruction>;
    public rawInstructions: Array<Instruction>;
    public memory = new Int16Array(2048);
    public org = 0;

    public outputBuffer = new Array();
    public inputBuffer = new Array();

    public delayInMS = 0;

    public onMemoryChangedDelegate: (address: number, value: number) => void;
    public onNeedsInputDelegate: () => void;
    public onExecutionPaused: () => void;
    public onExecutionResumed: () => void;
    public onExecutionFinished: () => void;
    public onOutput: (char: string) => void;
    public onTick: () => void;
    public onFinishedCompile: () => void;


    public IRToLine: { [IR: number]: number } = [];

    // Convert to objects...
    // Build Symbol Table
    // Get Raw instructions before compile, and save them off
    // Create compiled instructions objects
    // Convert compiled instructions to memory.
    constructor(instructions?: string) {
        if (instructions) {
            this.performFullCompile(instructions);
        }
    }

    public lint(instructions: string) {
        var ins = this.tokenize(instructions);
        var symbols = this.buildSymbolTable(ins);
        var assembled = this.assemble(ins, symbols);
    }

    private reset() {
        this.isFinishedExecuting = false;
        this.isRunning = false;
        this.isWaitingOnInput = false;
        this.IRToLine = [];
        this.memory = undefined;
        this.Accumulator = 0;
        this.ProgramCounter = 0;
        this.Input = 0;
        this.MemoryBufferRegister = 0;
        this.MemoryAddressRegister = 0;
        this.InstructionRegister = 0;
        this.outputBuffer = [];
        this.inputBuffer = [];
    }

    public performFullCompile(instructions: string) {
        this.reset();
        var objects = this.tokenize(instructions);
        // console.log(objects);
        this.symbolTable = this.buildSymbolTable(objects);
        this.rawInstructions = objects;
        this.instructions = this.assemble(objects, this.symbolTable);
        this.memory = this.fillMemory(this.instructions);
        if (this.onFinishedCompile) this.onFinishedCompile();
    }

    public buildSymbolTable(instructions: Array<Instruction>): { [label: string]: number } {
        var map: { [label: string]: number } = {};
        for (var i = 0; i < instructions.length; i++) {
            if (instructions[i].label)
                map[instructions[i].label] = i + this.org;
        }
        return map;
    }

    public assemble(instructions: Array<Instruction>, symbolTable): Array<Instruction> {
        instructions = JSON.parse(JSON.stringify(instructions));
        var errors: Array<CompilerError> = [];
        for (var i = 0; i < instructions.length; i++) {
            var opcode = Opcode[("" + instructions[i].opcode).toUpperCase()]//this.opcodeStringToOpcode(<any>instructions[i].opcode);
            if (opcode === undefined) { errors.push(new CompilerError(instructions[i].linenumber, "Invalid Instruction " + instructions[i].opcode, "" + instructions[i].opcode)); continue; }
            else instructions[i].opcode = opcode;
            if (instructions[i].label && /^[0-9]/g.test(instructions[i].label))
                errors.push(new CompilerError(instructions[i].linenumber, "Label can not begin with a number", instructions[i].label));
            if (opcode != Opcode.CLEAR && opcode != Opcode.OUTPUT && opcode != Opcode.INPUT && opcode != Opcode.HALT && opcode != Opcode.DEC && opcode != Opcode.HEX) {
                if (instructions[i].param === undefined) {
                    errors.push(new CompilerError(instructions[i].linenumber, "Missing parameter for opcode: " + Opcode[opcode], ("" + instructions[i].opcode)));
                    continue;
                }
                if (opcode != Opcode.SKIPCOND && symbolTable[("" + instructions[i].param).trim()] === undefined) {
                    errors.push(new CompilerError(instructions[i].linenumber, "Can't find symbol: " + instructions[i].param, ("" + instructions[i].param)));
                    continue;
                } else {
                    if (opcode != Opcode.SKIPCOND)
                        instructions[i].param = symbolTable[instructions[i].param];
                }
            }
            // console.log(instructions[i]);
        }
        if (errors && errors.length > 0) throw errors;
        return instructions
    }

    public tokenize(instructions: string): Array<Instruction> {
        var ins: Array<Instruction> = [];
        this.org = 0;
        instructions = instructions.replace("\r\n", "\n");
        instructions = instructions.replace("\r", "\n");
        instructions = instructions.replace(/\t+/g, " ");
        instructions = instructions.replace(/(\/.*)/g, "")
        var lines = instructions.split("\n");
        lines.forEach((line, index) => {
            line = line.trim();
            if (!line) return;
            var i: Instruction = { opcode: null, linenumber: null };
            if (line.indexOf(",") != -1) {
                var split = line.split(",");
                i.label = split[0].trim();
                line = split[1];
                // console.log(line)
            }
            line = line.trim()//line.replace(/(^\ )+/g, "");
            var split = line.split(" ");
            i.opcode = <Opcode><any>split[0];
            if (split.length >= 2)
                i.param = <number><any>split[1];
            i.linenumber = index + 1;

            ins.push(i)
        })
        if (ins[0] && (<string><any>ins[0].opcode).toUpperCase() == "ORG") {
            this.org = Number(ins[0].param);
            ins.splice(0, 1);
            this.ProgramCounter = this.org;
        }
        return ins;
    }

    public fillMemory(instructions: Array<Instruction>): Int16Array {
        var memory = new Int16Array(1 << 11);
        for (var i = this.org; i < instructions.length + this.org; i++) {
            var index = i - this.org
            if (instructions[index].opcode == Opcode.DEC) {
                memory[i] = parseInt("" + instructions[index].param, 10) & 0xFFFF;
            } else if (instructions[index].opcode == Opcode.HEX) {
                memory[i] = parseInt("" + instructions[index].param, 16) & 0xFFFF;
            } else if (instructions[index].opcode == Opcode.SKIPCOND) {
                memory[i] = (instructions[index].opcode & 0xF) << 12;
                memory[i] |= parseInt("" + instructions[index].param, 16) & 0x0FFF;
            } else {
                memory[i] = (instructions[index].opcode & 0xF) << 12;
                memory[i] |= instructions[index].param & 0x0FFF;
            }
            this.IRToLine[memory[i]] = this.instructions[index].linenumber;
        }
        return memory;
    }

    private setMemory() {
        this.memory[this.MemoryAddressRegister] = this.MemoryBufferRegister;
        if (this.onMemoryChangedDelegate) this.onMemoryChangedDelegate(this.MemoryAddressRegister, this.MemoryBufferRegister);
    }

    private getMemory() {
        this.MemoryBufferRegister = this.memory[this.MemoryAddressRegister];
    }

    private getInput() {
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
            if (this.onNeedsInputDelegate) this.onNeedsInputDelegate();
        }
    }

    public sendInput(input: string) {
        this.inputBuffer = this.inputBuffer.concat(input.split("")).concat([0]);
        if (this.inputBuffer.length > 0 && this.isWaitingOnInput) {
            // console.log("Got the input i've been waiting for. Resuming.");
            this.getInput();
            this.isWaitingOnInput = false;
        }
    }

    public pauseExecution() {
        this.isRunning = false;
        if (this.onExecutionPaused) this.onExecutionPaused();
    }

    public resumeExecution() {
        this.isRunning = true;
        if (this.onExecutionResumed) this.onExecutionResumed();
        this.run();
    }

    private clampValues() {
        this.Accumulator &= 0xFFFF;
        // this.MemoryBufferRegister &= 0xFFFF;
        // this.MemoryAddressRegister &= 0xFFFF;
        // this.ProgramCounter &= 0xFFFF;
        // this.Input &= 0xFFFF;
        // this.InstructionRegister &= 0xFFFF;
    }

    public step() {
        // console.log(this.isRunning, this.isFinishedExecuting, this.isWaitingOnInput);
        if (!this.isWaitingOnInput && !this.isFinishedExecuting) {
            this.MemoryAddressRegister = this.ProgramCounter;
            this.InstructionRegister = this.memory[this.MemoryAddressRegister];
            this.ProgramCounter++;
            this.clampValues();
            if (this.onTick) this.onTick();
            this.interpret();
        }
    }

    public run() {
        // console.log("running...",this.isRunning);
        if (!this.isWaitingOnInput && this.isRunning && !this.isFinishedExecuting)
            this.step();
        if (this.isRunning && !this.isFinishedExecuting)
            setTimeout(this.run.bind(this), this.delayInMS);
    }

    interpret() {
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
                if (this.onOutput) this.onOutput(String.fromCharCode(this.Accumulator));
                break;
            case Opcode.HALT:
                this.isFinishedExecuting = true;
                this.pauseExecution();
                if (this.onExecutionFinished) this.onExecutionFinished();
                break;
            case Opcode.SKIPCOND:
                if (param >> 10 == 0x0002 && ToInt16(this.Accumulator) > 0) {
                    // console.log(this.Accumulator,"> 0")
                    this.ProgramCounter++;
                } else if (param >> 10 == 0x0001 && ToInt16(this.Accumulator) == 0) {
                    // console.log(this.Accumulator,"== 0")
                    this.ProgramCounter++;
                } else if (param >> 10 == 0x0000 && ToInt16(this.Accumulator) < 0) {
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
    }

}