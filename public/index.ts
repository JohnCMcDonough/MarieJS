///<reference path="../typings/tsd.d.ts"/>

var app = angular.module("mariejs", ['ui.codemirror']);

class MainController {
    interpreter = new MarieInterpreter();
    defaultCode: string = `LOAD a
ADD b
OUTPUT
HALT
a, DEC 10
b, DEC 15`;
    defaultmcdScript: string 
=`// Warning: 
// This is experimental...
// There is no code linting....
// There is no code validation....
// This may not generate valid assembly...
// There is no breakpoint debugging (as of yet)
// most of all....

// VARIABLES ARE DEFINED AT THE FUNCTION LEVEL, NOT BLOCK LEVEL.
// ALSO, RECURSION DOESN'T WORK EITHER. THERE IS NO STACK.

// THIS DOESN'T WORK
//  var i = 0;
//  var j = 0;
//  for(var i = 0; i < 5; i++) {
//     output(i);	
//   	var j = i; // this variable is NOT scoped.
//    	output(j);
//  }
//  output(i); // this will print 5
//  output(j); // this will print 4


// Defined "System" functions.
// input() // reads and returns a single character.
// output(char) // writes out a single character.

////////////////////////////////////////////////////////////////////
/////////////////////////// EXAMPLE CODE ///////////////////////////
////////////////////////////////////////////////////////////////////

/*
writeline("Enter your name...");
var name = new Array(20);
getstring(name);
write("hello ");
writeline(name);
*/

/*
var string_name = new Array(20);
var string_age = new Array(20);
var age = 0;
var string_yearsUntil = new Array(20);
var yearsUntil = 0;
writeline("Please enter your name...");
getstring(string_name);
writeline("Please enter your age...");
getstring(string_age);
age = parseInt(string_age);
yearsUntil = 62 - age;

intToString(yearsUntil,string_yearsUntil);
write(string_name);
write(", you've got ");
write(string_yearsUntil);
writeline(" years until you get Social Security");
*/

/*
////////////////////////////////////////////////////////////////////
//////////////////////// TUTORIAL FUNCTIONS ////////////////////////
////////////////////////////////////////////////////////////////////
function multiply(a,b) {
  var count = 0;
  for(var i = 0; i < b; i++) {
    count = count + a;
  }
  return count;
}
var mult = multiply(20,3);
output(mult)

// for loops
for(var i = 0; i <= 10; i++) {
    output(i)
}

// while loops
var x = 0;
while(x < 10) {
  x = x + x + 1;
}

// arrays
var array = new Array(15);
array[5] = 5;
array[10] = 10;
for(var i = 0; i < 15; i++) {
  output(array[i])
}

// strings
var hello = "hello world"; // this is really a null terminated array
for(var i = 0; hello[i] != 0; i++) { // loop through the string until we hit a null character (end of string)
 output(hello[i]) 
}
output('\\n')

var waiting = "waiting on input...";
for(var i = 0; waiting[i] != 0; i++) {
 output(waiting[i]) 
}
output('\\n')

// reading input
function readInput(string_destination) {
  var inp = input();
  var index = 0;
  while(inp != 0) {
    string_destination[index] = inp;
    index++;
    inp = input()
  }
}
var input = new Array(15);
readInput(input);
for(var i = 0; input[i] != 0; i++) {
 output(input[i]) 
}
*/

////////////////////////////////////////////////////////////////////
////////////////////////// HELPER FUNCTIONS ////////////////////////
////////////////////////////////////////////////////////////////////

function write(string) {
    for(var i = 0; string[i] != 0; i++) {
        output(string[i]);
    }
}

function writeline(string) {
    write(string);
    output("\\n");
}

function getstring(string_dest) {
    var inp = input()
    var index = 0;
    while(inp != 0) {
        string_dest[index] = inp;
        index++;
        inp = input()
    }
}

function strlen(str) {
	var length = 0;
	for(var i = 0; str[i] != 0; i++) {
    	length++;	
    }
  return length;
}

function multiply(a,b) {
  var count = 0;
  for(var i = 0; i < b; i++) {
    count = count + a;
  }
  return count;
}

function divide(num,denom) {
  var count = 0;
  num = num - denom;
  while(num > 0) {
    count++;
    num = num - denom;
  }
  return count;
}

function mod(num,denom) {
  var count = 0;
  num = num - denom;
  while(num > 0) {
    count++;
    num = num - denom;
  }
  return num + denom;
}

function parseInt(str) {
  var num = 0;
  var strlength = strlen(str);
  for(var i = 0; i < strlength - 1; i++) {
    num = num + multiply(multiply(10,strlength - i -1),str[i] - 48);
  }
  num = num + str[strlength - 1] - 48
  return num;
}

function intToString(num,str) {
  var places = new Array(10);
  var count = 0;
  while(num != 0) {
    places[count] = num;
    count++
    num = divide(num,10);
  }
  var length = strlen(places);
  count = length - 1;
  for(var i = 0; i < length; i++) {
    places[i] = places[i] - multiply(places[i+1],10);
    str[count] = places[i] + 48;
    count = count - 1;
  }
  str[count] = places[0] + 48
}
`;
    codeErrors: string[];
    lineError: number = -1;
    objectError: string = "";
    viewType: string = "HEX";

    private debounceTimer = 0;
    public instructionsCount = 0;

    private editor: CodeMirror.Editor;
    private defaultEditorOptions: CodeMirror.EditorConfiguration = {
        lineWrapping: true,
        lineNumbers: true,
        readOnly: false,
        gutters: ['breakpoint-gutter'],
        firstLineNumber: 0,
        lineNumberFormatter: (ln) => "0x" + ln.toString(16),
        mode:""
    }
    private mcdScriptEditorOptions: CodeMirror.EditorConfiguration = {
        lineWrapping: true,
        lineNumbers: true,
        readOnly: false,
        gutters: ['breakpoint-gutter'],
        firstLineNumber: 1,
        lineNumberFormatter: (ln) => ln.toString(10),
        mode:"text/javascript"
    }
    lintTimeout = 0;
    cpuFreq = 500;
    slowUI = false;

    static $inject = ["$scope", "$rootScope"];
    constructor(private $scope: angular.IScope, private $rootScope: angular.IScope) {
        $scope['mc'] = this;
        
        this.$scope['codemirrorLoaded'] = this.codemirrorLoaded.bind(this);
        // this.$scope.$watch('mc.code', () => {
        //     clearTimeout(this.lintTimeout);
        //     this.lintTimeout = setTimeout(this.lintCode.bind(this), 500);
        // })
        var freqToPeriod = () => {
            const EXP_GAIN = 1 / 10;
            this.interpreter.delayInMS = 1000 * Math.pow(Math.E, -.005 * this.cpuFreq);
        }

        this.$scope.$watch('mc.cpuFreq', freqToPeriod)
        freqToPeriod();
    }

    markComments() {
        if(this.currentEditorView == "assembly")
            this.editor.getDoc().eachLine(line => {
                var commentBeginsAt = line.text.indexOf("/");
                var lineNum = this.editor.getDoc().getLineNumber(line);
                if (commentBeginsAt == -1) return;

                this.editor.getDoc().markText({ line: lineNum, ch: commentBeginsAt }, { line: lineNum, ch: line.text.length }, { className: "comment" });
            })
    }

    highlightedLine: CodeMirror.LineHandle;
    lintCode() {
        if (this.editor) {
            // this.editor.clearGutter("note-gutter");
            this.editor.getDoc().getAllMarks().forEach(mark => mark.clear())
        }
        this.codeErrors = [];
        this.instructionsCount = 0;
        if (this.interpreter && this.interpreter.pauseExecution) {
            this.interpreter.pauseExecution()
        }
        try {
            this.markComments();
            
            this.interpreter.lint(this.assemblyDocument.getValue());
            this.interpreter.onFinishedCompile = () => {
                this.editor.setOption("readOnly", false)
                this.$rootScope.$emit("setActiveMemory", -1, -1);
                this.$rootScope.$emit("memoryUpdate", -1);
                this.editor.refresh();
            }
            this.interpreter.onTick = () => {
                this.instructionsCount++;
                if (!this.debounceTimer) {
                    this.debounceTimer = +setTimeout(() => {


                        var line = this.interpreter.IRToLine[this.interpreter.InstructionRegister] - 1;
                        if (this.highlightedLine)
                            this.editor.removeLineClass(this.highlightedLine, "background", "active-line");
                        this.highlightedLine = this.editor.addLineClass(line, "background", "active-line");
                        this.editor.scrollIntoView({ line: line, ch: 0 }, 100);
                        this.$rootScope.$emit("setActiveMemory", this.interpreter.MemoryAddressRegister, this.interpreter.ProgramCounter);
                        // this.safeApply()
                        this.$scope.$applyAsync();
                        this.debounceTimer = null;
                    }, this.slowUI ? 500 : 50);
                }
                var line = this.interpreter.IRToLine[this.interpreter.InstructionRegister] - 1;
                if (this.breakpoints[line]) this.interpreter.pauseExecution();
            }
            this.interpreter.onOutput = () => {
                // this.safeApply();
            }
            this.interpreter.onMemoryChangedDelegate = (mar, mbr) => {
                this.$rootScope.$emit('memoryUpdate', mar, mbr);
            }
            this.interpreter.onExecutionFinished = () => {
                console.info(this.interpreter.outputBuffer);
                this.defaultEditorOptions.readOnly = false;
            }
        }
        catch (err) {
            if (err.map)
                this.codeErrors = (<Array<CompilerError>>err).map(err => {
                    err.lineNumber--;
                    var eString = "Error on Line 0x" + err.lineNumber.toString(16) + ": " + (<CompilerError>err).errorstring;
                    this.objectError = (err).object;
                    if (this.editor) {
                        var line = this.assemblyDocument.getLine(err.lineNumber);
                        var char = line.indexOf(this.objectError);
                        if (char != -1)
                            this.assemblyDocument.markText({ line: err.lineNumber, ch: char }, { line: err.lineNumber, ch: char + this.objectError.length }, { className: "line-error" });
                        else {
                            this.assemblyDocument.markText({ line: err.lineNumber, ch: 0 }, { line: err.lineNumber, ch: line.length }, { className: "line-error" });
                        }
                    }
                    return eString;
                });
            else
                console.log(err);
        }
        this.safeApply();
    }

    assemble() {
        if(this.currentEditorView == 'mcdscript') {
            var ast = window["esprima"].parse(this.mcdscriptDocument.getValue());
            var comp = new Compiler(ast);
            var ins = comp.compile();
            var diff = ins.length;
            comp.optimize(ins);
            diff -= ins.length;
            console.log("optimized out " + diff + " instructions");
            var code = comp.instructionsToRaw(ins);
            this.assemblyDocument.setValue(code);
            this.switchDocument();
            return;
        }
        this.lintCode();
        if (this.editor && this.highlightedLine)
            this.editor.removeLineClass(this.highlightedLine, "background", "active-line");
        if (this.codeErrors.length == 0) {
            this.interpreter.performFullCompile(this.assemblyDocument.getValue());
        }
    }

    playPause() {
        if (this.interpreter.isRunning) {
            this.interpreter.pauseExecution();
        }
        else {
            if (this.interpreter.isFinishedExecuting) {
                this.assemble();
            }
            else {
                this.interpreter.resumeExecution();
                this.editor.setOption("readOnly", "nocursor")
                this.editor.refresh();
            }
        }
    }

    codemirrorLoaded(editor: CodeMirror.Editor) {
        this.editor = editor;
        window["editor"] = editor;
        this.assemblyDocument = new CodeMirror.Doc(this.defaultCode);
        this.mcdscriptDocument = new CodeMirror.Doc(this.defaultmcdScript);
        this.editor.swapDoc(this.assemblyDocument);
        this.editor.refresh();
        this.editor.on("gutterClick", this.codeEditorGutterClick.bind(this));
        this.editor.on("change", this.rebuildBreakPoints.bind(this));
        this.editor.on("change", this.markComments.bind(this));
        this.editor.on("change", () => {
            clearTimeout(this.lintTimeout);
            this.lintTimeout = setTimeout(this.lintCode.bind(this), 500);
        })
    }

    private breakpoints: Array<boolean> = [];
    codeEditorGutterClick(instance: CodeMirror.Editor, line: number, gutter: string, clickEvent: Event) {
        if (gutter == "CodeMirror-linenumbers") return;
        if (!this.breakpoints[line]) {
            var icon = document.createElement("i");
            icon.innerHTML = '<div style="padding: 2px 0 0 4px"><i class="fa fa-circle text-danger"></i></div>';
            instance.setGutterMarker(line, gutter, icon);
            this.breakpoints[line] = true;
        } else {
            instance.setGutterMarker(line, gutter, undefined);
            this.breakpoints[line] = false;
        }
    }

    rebuildBreakPoints() {
        this.breakpoints = [];
        var lineNum = 0;
        this.editor.getDoc().eachLine(l => {
            if (this.editor.lineInfo(l)['gutterMarkers'] && this.editor.lineInfo(l)['gutterMarkers']['breakpoint-gutter']) {
                this.breakpoints[lineNum] = true;
            }
            // console.log(lineNum, l, this.editor.lineInfo(l), this.breakpoints[lineNum])
            lineNum++;
        })
    }

    safeApply(fn?: () => void) {
        var phase = this.$scope.$root.$$phase;
        if (phase == '$apply' || phase == '$digest') {
            if (fn && (typeof (fn) === 'function')) {
                fn();
            }
        } else {
            this.$scope.$apply(fn);
        }
    };
    
    currentEditorView = "assembly";
    mcdscriptDocument: CodeMirror.Doc;
    assemblyDocument: CodeMirror.Doc;
    
    switchDocument() {
        this.currentEditorView = this.currentEditorView == 'assembly' ? "mcdscript" : "assembly";
        if(this.currentEditorView == "assembly")this.editor.swapDoc(this.assemblyDocument);
        else this.editor.swapDoc(this.mcdscriptDocument);
        var options = this.mcdScriptEditorOptions;
        if(this.currentEditorView == 'assembly') {
            options = this.defaultEditorOptions;
        } 
        for(var key in options) {
            var val = options[key];
            this.editor.setOption(key,val);
        }
        this.lintCode();
    }
    
}
app.controller("MainController", MainController);

app.directive('ngAllowTab', function() {
    return function(scope, element, attrs) {
        element.bind('keydown', function(event) {
            if (event.which == 9) {
                event.preventDefault();
                var start = this.selectionStart;
                var end = this.selectionEnd;
                element.val(element.val().substring(0, start)
                    + '\t' + element.val().substring(end));
                this.selectionStart = this.selectionEnd = start + 1;
                element.triggerHandler('change');
            }
        });
    };
});

app.directive('memoryTable', () => {
    return {
        restrict: 'A',
        scope: {
            memory: '=',
            viewtype: "=",
        },
        template: `
		<div class="mariejs-memoryTable">
			<table class="header">
				<thead>
					<tr>
						<th></th>
						<th ng-repeat="col in cols">+{{col | toHex}}</th>
					</tr>
				</thead>
			</table>
			<div class="scrollable">
				<table class="table-striped">
					<tbody>
						<tr ng-repeat="row in rows">
							<th>{{row | toHex | padHex:3}}</th>
							<td ng-repeat="col in cols" ng-class="{flash:WRITE == row+col,green:MAR == col + row,red:PC == col + row}">
								<span ng-show="viewtype == 'HEX'">{{memory[row + col] | toHex | padHex:4}}</span>
								<span ng-show="viewtype == 'ASCII'">{{memory[row + col] | toASCII}}</span>
								<span ng-show="viewtype == 'DEC'">{{memory[row + col]}}</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>`,
        controller: ["$scope", "$rootScope", ($scope: angular.IScope, $rootScope: angular.IScope) => {
            $scope['WRITE'] = -1;
            $scope['MAR'] = -1;
            $scope['PC'] = -1;
            function fillMemory() {
                if (!$scope['memory']) {
                    $scope['memory'] = new Int16Array(2048);
                }

                $scope['cols'] = [];
                for (var i = 0; i < 16; i++) {
                    $scope['cols'].push(i);
                }

                $scope['rows'] = [];
                for (var i = 0; i < $scope['memory'].length; i += 16) {
                    $scope['rows'].push(i);
                }
            }
            fillMemory();

            $rootScope.$on('memoryUpdate', (e, address, newValue) => {
                $scope['WRITE'] = address;
            })
            $rootScope.$on('setActiveMemory', (e, MAR, PC) => {
                $scope['MAR'] = MAR;
                $scope['PC'] = PC;
            })
        }]
    };
});

app.filter('toASCII', () => (x) => {
    return String.fromCharCode(x);
});
app.filter('toHex', () => (x) => {
    if (x < 0) {
        x = 0xFFFFFFFF + x + 1;
    }
    return (x & 0xFFFF).toString(16).toUpperCase()
});
app.filter('padHex', () => (x: string, padSize = 4) => {
    var r = "";
    for (var i = 0; i < padSize - x.length; i++) r += "0";
    return r + x;
});
app.filter("toDec", () => (num: number) => num >> 15 ? 0xFFFFFFFFFFFF0000 | (num & 0xFFFF) : num);

app.filter('numberArrayToString', () => (x: Array<number>) => x && x.map((v) => String.fromCharCode(v)).join(""));
app.filter('numberArrayToHex', ["$filter", ($filter) => (x: Array<number>) => { x && x.map((v) => "0x" + $filter("toHex")(v)).join() }]);
app.filter('numberArrayToDecimal', ["$filter", ($filter) => (x: Array<number>) => x && x.map(dec => $filter("toDec")(dec)).join()]);