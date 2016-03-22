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
}

class MarieInterpreter {

	public Accumulator = 0x0000;
	public InstructionRegister: Opcode = 0x0000;
	public MemoryAddressRegister = 0x0000;
	public MemoryBufferRegister = 0x0000;
	public ProgramCounter = 0x0000;
	public Input = 0x0000;

	public isRunning = true;
	public isWaitingOnInput = false;
	public isFinishedExecuting = false;
	public symbolTable: { [label: string]: number };
	public instructions: Array<Instruction>;
	public rawInstructions: Array<Instruction>;
	public memory: Int16Array;
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

	constructor(instructions: string) {
		var objects = this.convertToObjects(instructions);
		if (objects[0] && (<string><any>objects[0].opcode).toUpperCase() == "ORG") {
			this.org = Number(objects[0].param);
			this.ProgramCounter = this.org;
		}
		// console.log(objects);
		this.symbolTable = this.buildSymbolTable(objects);
		this.rawInstructions = JSON.parse(JSON.stringify(objects));
		this.instructions = this.assemble(objects);
		this.memory = this.fillMemory(this.instructions);
	}

	private buildSymbolTable(instructions: Array<Instruction>): { [label: string]: number } {
		var map: { [label: string]: number } = {};
		for (var i = 0; i < instructions.length; i++) {
			if (instructions[i].label)
				map[instructions[i].label] = i;
		}
		return map;
	}

	private assemble(instructions: Array<Instruction>): Array<Instruction> {
		for (var i = 0; i < instructions.length; i++) {
			var opcode = Opcode[("" + instructions[i].opcode).toUpperCase()]//this.opcodeStringToOpcode(<any>instructions[i].opcode);
			if (opcode === undefined) throw new Error("Invalid Instruction " + JSON.stringify(instructions[i]));
			else instructions[i].opcode = opcode;
			
			if (opcode != Opcode.CLEAR && opcode != Opcode.OUTPUT && opcode != Opcode.INPUT && opcode != Opcode.HALT && opcode != Opcode.DEC && opcode != Opcode.HEX) {
				if (instructions[i].param === undefined)
					throw new Error("Missing parameter for opcode: " + Opcode[opcode]);
				if (opcode != Opcode.SKIPCOND && this.symbolTable[("" + instructions[i].param).trim()] === undefined) {
					throw new Error("Can't find symbol: " + instructions[i].param);
				} else {
					if (opcode != Opcode.SKIPCOND)
						instructions[i].param = this.symbolTable[instructions[i].param];
				}
			}
			// console.log(instructions[i]);
		}
		return instructions
	}

	private convertToObjects(instructions: string): Array<Instruction> {
		var ins: Array<Instruction> = [];
		instructions = instructions.replace("\r\n", "\n");
		instructions = instructions.replace("\r", "\n");
		instructions = instructions.replace("\n+", "\n");
		instructions = instructions.replace(/\t+/g, " ");
		instructions = instructions.trim();
		// console.log(instructions);
		var lines = instructions.split("\n");
		lines.forEach(line => {
			line = line.trim();
			if (!line) return;
			var i: Instruction = { opcode: null };
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
			ins.push(i)
		})
		return ins;
	}

	private fillMemory(instructions: Array<Instruction>): Int16Array {
		var memory = new Int16Array(1 << 11)
		for (var i = this.org; i < instructions.length + this.org; i++) {
			if (instructions[i].opcode == Opcode.DEC) {
				memory[i] = parseInt("" + instructions[i].param, 10) & 0xFFFF;
			} else if (instructions[i].opcode == Opcode.HEX) {
				memory[i] = parseInt("" + instructions[i].param, 16) & 0xFFFF;
			} else if (instructions[i].opcode == Opcode.SKIPCOND) {
				memory[i] = (instructions[i].opcode & 0xF) << 12;
				memory[i] |= parseInt("" + instructions[i].param, 16) & 0x0FFF;
			} else {
				memory[i] = (instructions[i].opcode & 0xF) << 12;
				memory[i] |= instructions[i].param & 0x0FFF;
			}
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
	}

	public step() {
		// console.log(this.isRunning, this.isFinishedExecuting, this.isWaitingOnInput);
		if (!this.isWaitingOnInput) {
			this.MemoryAddressRegister = this.ProgramCounter;
			this.InstructionRegister = this.memory[this.MemoryAddressRegister];
			this.ProgramCounter++;
			this.interpret();
		}
	}

	public run() {
		// console.log("running...",this.isRunning);
		if (!this.isWaitingOnInput && this.isRunning && !this.isFinishedExecuting)
			this.step();
		if (this.isRunning && !this.isFinishedExecuting)
			if (this.delayInMS == 0)
				setImmediate(this.run.bind(this));
			else
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
				if (param >> 10 == 0x0002 && this.Accumulator > 0) {
                    // console.log(this.Accumulator,"> 0")
					this.ProgramCounter++;
				} else if (param >> 10 == 0x0001 && this.Accumulator == 0) {
                    // console.log(this.Accumulator,"== 0")
					this.ProgramCounter++;
				} else if (param >> 10 == 0x0000 && this.Accumulator < 0) {
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