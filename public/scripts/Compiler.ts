Array.prototype['merge'] = function (other) {
    if (Array.isArray(other))
        other.forEach(item => this.push(item));
    else {
        this.push(other);
    }
    return this;
}

interface FuncDecl {
    name: string;
    instructions: string;
    params?: string;
}

class Compiler {

    public prototype: any;
    public ast: any;
    public functions: Array<FuncDecl> = [];
    public hasReturn: any = {};
    public variables: Array<Instruction> = [];

    private LITERAL_COUNT = 0;
    private CONDITIONAL_COUNT = 0;
    private WHILE_COUNT = 0;
    private IF_COUNT = 0;
    private ARRAY_COUNT = 0;

    private static SKIP_NEGATIVE = "0";
    private static SKIP_EQUAL = "400";
    private static SKIP_POSITIVE = "800"

    constructor(ast: any) {
        this.ast = ast;
    }

    compile(ast: any = this.ast): Array<Instruction> {
        var instructions: any;
         // get around not having typings for Pure JavaScript traverse function
        window["traverse"](ast, {
            pre: (node, parent) => {
                this.prepare(node);
                if (this[node.type])
                    this[node.type](node, false);
            },
            post: (node, parent) => {
                this.prepare(node);
                if (this[node.type])
                    this[node.type](node, true);
                if (node == ast)
                    instructions = node.instructions;
            }
        })
        console.log("vars", this.variables);
        instructions.push({ opcode: "HALT", label: "END_OF_PROGRAM" })
        this.variables.push({ label: "LEFT", opcode: "DEC", param: 0 })
        this.variables.push({ label: "RIGHT", opcode: "DEC", param: 0 });
        this.variables.push({ label: "FUNCTION_RETURN", opcode: "DEC", param: 0 });
        this.variables.push({ label: "TEMP", opcode: "DEC", param: 0 });
        this.variables.push({ label: "ARRAY_INDEX", opcode: "DEC", param: 0 });
        this.variables.push({ label: "VALUE_1", opcode: "DEC", param: 1 });
        instructions.merge(this.variables);
        this.functions.forEach(f => {
            instructions.merge(f.instructions);
        })
        console.log(instructions);
        return instructions;
    }

    instructionsToRaw(instructions: Array<Instruction>) {
        var ins = "";
        instructions.forEach(i => {
            ins += (i.label ? i.label + "," : "") + "\t";
            ins += i.opcode + "\t";
            if (i.opcode == "DEC" && !i.param) i.param = +"0";
            ins += (i.param ? i.param : "") + "\t\n";
        })
        return ins;
    }

    instructionsFromOperator(operator: string, param?: string | any): Instruction | Array<Instruction> {
        switch (operator) {
            case "+": return { opcode: "ADD", param: param };
            case "-": return { opcode: "SUBT", param: param };
            default: throw new Error("Unsupported operator");
        }
    }

    prepare(node) {
        if (!node.instructions)
            node.instructions = new Array();
        if (node.type == "BinaryExpression" &&
            (node.operator == ">=" || node.operator == "<=" ||
                node.operator == "<" || node.operator == ">" ||
                node.operator == "==" || node.operator == "!=")) {
            node.type = "ConditionalExpression"
        }

        if (node.type == "Literal" && typeof (node.value) == 'string' && (<string>node.value).length > 1) {
            node.type = "ArrayExpression";
            node.elements = [];
            for (var i = 0; i < node.value.length; i++) {
                node.elements.push({ type: "Literal", value: node.value.charAt(i) });
            }
            node.elements.push({ type: "Literal", value: "" });
            delete node.value;
            delete node.raw;
        }
        //  if(node.type == "FunctionDeclaration") {
        //      var hasReturn = false;
        //      traverse(node,{pre:(node)=>{
        //          if(node.type == "ReturnStatement")
        //             hasReturn = true;
        //      }});
        //      this.hasReturn[node.id.name] = hasReturn;
        //  }
    }

    optimize(instructions: Array<any>) {
        for (var i = 0; i < instructions.length; i++) {
            if (instructions[i].opcode == "LOAD") {
                if (
                    i - 1 >= 0 && (instructions[i - 1].opcode == "STORE" || instructions[i - 1].opcode == "LOAD")
                    && instructions[i - 1].param == instructions[i].param && (!instructions[i].label || instructions[i].label == "")
                ) {
                    instructions.splice(i, 1);
                }
            }
        }
    }

    scopeRename(instructions, name, rename) {
        // console.log(instructions);
        instructions.forEach(ins => {
            if (ins.param == name) {
                console.log("RENAMING...");
                ins.param = rename;
            }
        })
    }

    handleSpecialFunction(node): Array<Instruction> {
        if (node.callee.name == "output" && node.arguments.length > 0) {
            return node.arguments[0].instructions.merge({ opcode: "OUTPUT" });
        }
        if (node.callee.name == "input") {
            return [{ opcode: "INPUT" }];
        }
        return undefined;
    }

    ///////////////////////////////////////////////////////////////////////////////////////////////////// 
    Literal(node, isExiting: boolean) {
        if (isExiting) return;
        if (typeof (node.value) == "string") {
            node.value = node.value.charCodeAt(0);
        }

        var foundLiteral = undefined;
        // this.variables.forEach(ins=>{
        //     if(ins.param === node.value) {
        //         foundLiteral = ins;
        //     }
        // })
        // console.log(typeof(node.value));
        if (!foundLiteral)
            foundLiteral = { opcode: "DEC", param: node.value, label: "LITERAL_" + this.LITERAL_COUNT++ };
        node.name = foundLiteral.label;
        node.type = "Identifier";
        if (this.variables.filter(v => { return v.label == foundLiteral.label }).length == 0)
            this.variables.push(foundLiteral);
    }

    Identifier(node, isExiting: boolean) {
        if (isExiting)
            node.instructions.merge({ opcode: "LOAD", param: node.name })
    }

    BinaryExpression(node, isExiting: boolean) {
        // console.log("FOUND BINARY EXPRESSION",node,isExiting);
        if (!isExiting) return;

        node.instructions.merge(node.left.instructions);

        // This identifier check can be left in for the purposes of optimization.
        if (node.right.type == "Identifier") {
            node.instructions.merge(this.instructionsFromOperator(node.operator, node.right.name));
        } else {
            node.instructions.merge({ opcode: "STORE", param: "LEFT" })
            node.instructions.merge({ opcode: "CLEAR" })
            node.instructions.merge(node.right.instructions);
            node.instructions.merge({ opcode: "STORE", param: "RIGHT" });
            node.instructions.merge({ opcode: "LOAD", param: "LEFT" });
            node.instructions.merge(this.instructionsFromOperator(node.operator, "RIGHT"));
        }
    }

    AssignmentExpression(node, isExiting: boolean) {
        if (!isExiting) return;


        if (node.operator == "=") {
            node.instructions.merge(node.right.instructions)
        }
        if (node.operator != "=") {
            node.operator = node.operator.charAt(0);
            this.BinaryExpression(node, isExiting);
        }
        if (node.left.type == "MemberExpression") {
            node.instructions.merge(node.left.storeinstructions);
            node.instructions.merge({ opcode: "STOREI", param: "ARRAY_INDEX" });
        }
        else
            node.instructions.merge({ opcode: "STORE", param: node.left.name });
    }

    UpdateExpression(node, isExiting: boolean) {
        if (!isExiting) {
            node.left = { type: "Identifier", name: node.argument.name };
            node.right = { type: "Literal", value: 1, raw: 1 };
            node.operator = node.operator.charAt(0) + "=";
        }
        else {
            this.AssignmentExpression(node, isExiting);
        }
    }

    VariableDeclarator(node, isExiting: boolean) {
        if (!isExiting) return;

        if (this.variables.filter(v => { return v.label == node.id.name }).length == 0)
            this.variables.push({ opcode: "DEC", label: node.id.name });
        if (node.init != null) {
            node.instructions.merge(node.init.instructions);
            node.instructions.push({ opcode: "STORE", param: node.id.name })
        }
        // node.instructions.merge(node.init.instructions);
        // node.instructions.merge({opcode:"STORE",param:node.id.name});
    }

    VariableDeclaration(node, isExiting: boolean) {
        if (!isExiting) return;
        node.declarations.forEach((n) => {
            node.instructions.merge(n.instructions);
        })
    }

    Program(node, isExiting: boolean) {
        if (!isExiting) return;
        node.body.forEach((n) => {
            node.instructions.merge(n.instructions);
        })
    }

    ExpressionStatement(node, isExiting: boolean) {
        if (!isExiting) return;
        node.instructions.merge(node.expression.instructions);
    }

    BlockStatement(node, isExiting: boolean) {
        if (!isExiting) return;
        node.body.forEach(item => { node.instructions.merge(item.instructions) })
    }

    FunctionDeclaration(node, isExiting: boolean) {
        if (!isExiting) {
            node.toRename = node.toRename || [];
            
            window["traverse"](node.body, {
                pre: (node2, parent) => {
                    if (node2.type == "VariableDeclarator") {
                        node.toRename.push(node2.id.name);
                        node2.id.name = node.id.name + "_VAR_" + node2.id.name;
                    }
                }
            });
        }
        else {
            var paramCount = 0;
            node.params.forEach(param => {
                var newName = node.id.name + "_PARAM_" + paramCount++
                node.instructions.merge({ opcode: "DEC", label: newName });
                param.newName = newName;
                this.scopeRename(node.body.instructions, param.name, newName);
            })
            if (node.toRename) node.toRename.forEach(name => {
                this.scopeRename(node.body.instructions, name, node.id.name + "_VAR_" + name);
            })

            node.instructions.merge(<Instruction>{ opcode: "DEC", param: +"0", label: node.id.name, });
            node.instructions = node.instructions.merge(node.body.instructions);
            node.instructions.merge({ opcode: "JUMPI", param: node.id.name });
            node.instructions.forEach(i => {
                if (i.param && i.param == "FUNCTION_NAME_REPLACE") {
                    i.param = node.id.name;
                }
            })
            this.functions.push({ name: node.id.name, instructions: node.instructions, params: node.params });
            node.instructions = new Array();
        }
    }

    CallExpression(node, isExiting: boolean) {
        if (!isExiting) return;
        var ins;
        if ((ins = this.handleSpecialFunction(node))) {
            node.instructions = ins;
            return;
        }
        var paramCount = 0;
        node.arguments.forEach(arg => {
            if (arg.type == "Identifier")
                node.instructions.push({ opcode: "LOAD", param: arg.name });
            else
                node.instructions.merge(arg.instructions);
            node.instructions.push({ opcode: "STORE", param: node.callee.name + "_PARAM_" + paramCount++ })
        })
        node.instructions.push({ opcode: "JNS", param: node.callee.name });
        // if(this.hasReturn[node.callee.name]) {
        //     node.instructions.push({opcode:"LOAD",param:"FUNCTION_RETURN"});
        // }
    }

    ConditionalExpression(node, isExiting: boolean) {
        if (!isExiting) return;

        var true_condition = { opcode: "TRUE" };
        var false_condition = { opcode: "FALSE" };

        node.instructions.merge(node.left.instructions);
        // Optimization
        if (node.right.type == "Identifier") {
            node.instructions.merge({ opcode: "SUBT", param: node.right.name });
        }
        else {
            node.instructions.merge({ opcode: "STORE", param: "LEFT" })
            node.instructions.merge({ opcode: "CLEAR" })
            node.instructions.merge(node.right.instructions);
            node.instructions.merge({ opcode: "STORE", param: "RIGHT" });
            node.instructions.merge({ opcode: "LOAD", param: "LEFT" });
            node.instructions.merge({ opcode: "SUBT", param: "RIGHT" });
        }
        var instructions = [];
        switch (node.operator) {
            case "<":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_NEGATIVE },
                    { opcode: "FALSE" },
                    { opcode: "TRUE" }
                ]
                break;
            case ">":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_POSITIVE },
                    { opcode: "FALSE" },
                    { opcode: "TRUE" }
                ]
                break;
            case "<=":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_POSITIVE },
                    { opcode: "TRUE" },
                    { opcode: "FALSE" }
                ]
                break;
            case ">=":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_NEGATIVE },
                    { opcode: "TRUE" },
                    { opcode: "FALSE" }
                ]
                break;
            case "==":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_EQUAL },
                    { opcode: "FALSE" },
                    { opcode: "TRUE" }
                ]
                break;
            case "!=":
                instructions = [
                    { opcode: "SKIPCOND", param: Compiler.SKIP_POSITIVE },
                    { opcode: "JUMP", param: "IF" + this.CONDITIONAL_COUNT + "_OR" },
                    { opcode: "TRUE" },
                    { opcode: "SKIPCOND", param: Compiler.SKIP_NEGATIVE, label: "IF" + this.CONDITIONAL_COUNT + "_OR" },
                    { opcode: "FALSE" },
                    { opcode: "TRUE" }
                ]
                break;
        }
        node.instructions.merge(instructions);
        this.CONDITIONAL_COUNT++;
    }

    IfStatement(node, isExiting) {
        if (!isExiting) return;
        node.instructions.merge(node.test.instructions);
        var true_label = "IF_" + this.IF_COUNT + "_TRUE";
        var false_label = "IF_" + this.IF_COUNT + "_FALSE";

        if (node.consequent && node.consequent.instructions[0]) {
            node.consequent.instructions[0].label = node.consequent.instructions[0].label || true_label;
            true_label = node.consequent.instructions[0].label;
            node.consequent.instructions.merge({ opcode: "JUMP", param: "IF_" + this.IF_COUNT + "_END" })
        } else {
            true_label = "IF_" + this.IF_COUNT + "_END";
        }

        if (node.alternate && node.alternate.instructions[0]) {
            node.alternate.instructions[0].label = node.alternate.instructions[0].label || false_label;
            false_label = node.alternate.instructions[0].label;
        } else {
            false_label = "IF_" + this.IF_COUNT + "_END";
        }

        if (node.consequent) node.instructions.merge(node.consequent.instructions);
        if (node.alternate) node.instructions.merge(node.alternate.instructions);
        node.instructions.merge({ opcode: "CLEAR", label: "IF_" + this.IF_COUNT++ + "_END" });
        node.instructions.forEach(ins => {
            if (ins.opcode == "TRUE") {
                ins.opcode = "JUMP"
                ins.param = true_label;
            }
            if (ins.opcode == "FALSE") {
                ins.opcode = "JUMP"
                ins.param = false_label;
            }
        })
    }

    WhileStatement(node, isExiting: boolean) {
        if (!isExiting) return;
        var loop_true_label = (node.body.instructions[0] && node.body.instructions[0].label) || "DO_WHILE_" + this.WHILE_COUNT;
        var loop_begin = (node.test.instructions[0] && node.test.instructions[0].label) || "WHILE_" + this.WHILE_COUNT + "_BEGIN";
        node.test.instructions[0].label = loop_begin;
        node.instructions.merge(node.test.instructions);
        node.instructions.forEach(ins => {
            if (ins.opcode == "TRUE") {
                ins.opcode = "JUMP";
                ins.param = loop_true_label;
            }
            else if (ins.opcode == "FALSE") {
                ins.opcode = "JUMP";
                ins.param = "WHILE_" + this.WHILE_COUNT + "_END";
            }
        });

        if (node.body.instructions.length == 0) return;
        node.body.instructions.push({ opcode: "JUMP", param: loop_begin });
        node.body.instructions.push({ opcode: "CLEAR", label: "WHILE_" + this.WHILE_COUNT + "_END" });
        var loop_true_label = (node.body.instructions[0] && node.body.instructions[0].label) || "DO_WHILE_" + this.WHILE_COUNT;
        node.body.instructions[0].label = loop_true_label;
        node.instructions.merge(node.body.instructions);
        this.WHILE_COUNT++;
    }

    ForStatement(node, isExiting: boolean) {
        if (!isExiting) {

        } else {
            node.instructions.merge((node.init && node.init.instructions) || {});
            node.body.instructions.merge((node.update && node.update.instructions) || {});
            this.WhileStatement(node, isExiting);
        }
    }

    ReturnStatement(node, isExiting: boolean) {
        if (!isExiting) return;
        // node.argument.instructions.merge({ opcode: "STORE", param: "FUNCTION_RETURN" })
        node.instructions.merge(node.argument.instructions);
        // node.instructions.push({opcode:"JUMPI",param:"FUNCTION_NAME_REPLACE"});
    }

    ArrayExpression(node, isExiting: boolean) {
        if (!isExiting) return;
        if (!node.id) node.id = {};
        node.id.name = "ARRAY_" + this.ARRAY_COUNT++;
        this.variables.push({ opcode: "DEC", param: node.elements.length, label: node.id.name + "_LEN" });
        this.variables.push({ opcode: "JNS", param: node.id.name, label: node.id.name })
        for (var i = 0; i < node.elements.length; i++) {
            this.variables.push({ opcode: "DEC", label: node.id.name + "_" + i });
            node.instructions.merge(node.elements[i].instructions);
            node.instructions.merge({ opcode: "STORE", param: node.id.name + "_" + i })
        }
        node.instructions.merge({ opcode: "LOADI", param: node.id.name });
        return;
    }

    NewExpression(node, isExiting: boolean) {
        if (node.callee.name == "Array") {
            if (!node.id) node.id = {};
            node.id.name = "ARRAY_" + this.ARRAY_COUNT++;
            this.variables.push({ opcode: "DEC", param: node.arguments.length, label: node.id.name + "_LEN" });
            this.variables.push({ opcode: "JNS", param: node.id.name, label: node.id.name })
            for (var i = 0; i < node.arguments[0].value; i++) {
                this.variables.push({ opcode: "DEC", label: node.id.name + "_" + i });
            }
            node.instructions.merge({ opcode: "LOADI", param: node.id.name });
        }
    }

    MemberExpression(node, isExiting: boolean) {
        if (!isExiting) return;
        //console.log("instructions...",util.inspect(node,true,100,true));
        node.storeinstructions = [];
        node.storeinstructions.merge([
            { opcode: "STORE", param: "TEMP" },
        ])
        node.storeinstructions.merge(node.property.instructions);
        node.storeinstructions.merge([
            { opcode: "ADD", param: node.object.name },
            { opcode: "ADD", param: "VALUE_1" },
            { opcode: "STORE", param: "ARRAY_INDEX" },
            { opcode: "LOAD", param: "TEMP" }
        ])
        //////// HERE STARTS LOAD INS /////
        node.instructions.merge(node.property.instructions);
        node.instructions.merge([
            { opcode: "ADD", param: node.object.name },
            { opcode: "ADD", param: "VALUE_1" },
            { opcode: "STORE", param: "ARRAY_INDEX" },
            { opcode: "LOADI", param: "ARRAY_INDEX" }
        ])
    }

}