///<reference path="../typings/tsd.d.ts"/>

var app = angular.module("mariejs", ['ui.codemirror']);

class MainController {
    interpreter = new MarieInterpreter();
    code: string = `LOAD a
ADD b
OUTPUT
HALT
a, DEC 10
b, DEC 15`;
    codeErrors: string[];
    lineError: number = -1;
    objectError: string = "";
    viewType: string = "HEX";

    private debounceTimer = 0;
    public instructionsCount = 0;

    private editor: CodeMirror.Editor;
	private editorOptions: CodeMirror.EditorConfiguration = {
		lineWrapping: true,
		lineNumbers: true,
		readOnly: false,
		gutters: ['note-gutter'],
		firstLineNumber: 0,
		lineNumberFormatter: (ln) => "0x" + ln.toString(16),
	}
	lintTimeout = 0;

    static $inject = ["$scope", "$rootScope"];
    constructor(private $scope: angular.IScope, private $rootScope: angular.IScope) {
        $scope['mc'] = this;

		this.$scope['codemirrorLoaded'] = this.codemirrorLoaded.bind(this);
		this.$scope.$watch('mc.code', () => {
			clearTimeout(this.lintTimeout);
			this.lintTimeout = setTimeout(this.lintCode.bind(this), 500);
		})
    }

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
			this.interpreter.lint(this.code);
            this.interpreter.onTick = () => {
                this.instructionsCount++;
                if (this.debounceTimer) {
                    clearTimeout(this.debounceTimer);
                }
                this.debounceTimer = setTimeout(this.safeApply.bind(this), 5);
            }
            this.interpreter.onOutput = () => {
                // this.safeApply();
            }
            this.interpreter.onMemoryChangedDelegate = (mar, mbr) => {
                this.$rootScope.$emit('memoryUpdate', mar, mbr);
            }
            this.interpreter.onExecutionFinished = () => {
                console.info(this.interpreter.outputBuffer);
            }
        }
        catch (err) {
            this.codeErrors = (<Array<CompilerError>>err).map(err => {
                err.lineNumber--;
                var eString = "Error on Line 0x" + err.lineNumber.toString(16) + ": " + (<CompilerError>err).errorstring;
                this.objectError = (err).object;
                if (this.editor) {
                    var line = this.editor.getDoc().getLine(err.lineNumber);
                    var char = line.indexOf(this.objectError);
                    if (char != -1)
                        this.editor.getDoc().markText({ line: err.lineNumber, ch: char }, { line: err.lineNumber, ch: char + this.objectError.length }, { className: "line-error" });
                    else {
                        this.editor.getDoc().markText({ line: err.lineNumber, ch: 0 }, { line: err.lineNumber, ch: line.length }, { className: "line-error" });
                    }
                }
				return eString;
            });
        }
		this.safeApply();
    }

	assemble() {
		this.lintCode();
		if (this.codeErrors.length == 0) {
			this.interpreter.performFullCompile(this.code);
		}
	}

	codemirrorLoaded(editor) {
		this.editor = editor;
		if (!editor.options.gutters) editor.gutters = [];
		editor.options.gutters.push("note-gutter");
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
							<td ng-repeat="col in cols" ng-class="{flash:onChange[row+col]}">
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
            $scope['onChange'] = {};
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
                $scope['onChange'][address] = true;
                setTimeout(() => {
                    $scope['onChange'][address] = false;
                    $scope.$apply();
                }, 50);
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
app.filter('numberArrayToString', () => (x: Array<number>) => x && x.map((v) => String.fromCharCode(v)).join(""));