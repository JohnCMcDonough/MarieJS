///<reference path="../typings/tsd.d.ts"/>

var app = angular.module("mariejs", ['ui.codemirror']);

class MainController {
    interpreter: MarieInterpreter;
    code: string = `LOAD a
ADD b
OUTPUT
HALT
a, DEC 10
b, DEC 15`;
    codeError: string = "";
    lineError: number = -1;
	objectError: string = "";
	viewType: "HEX" | "ASCII" | "DEC" = "HEX";

    private debounceTimer = 0;
    public instructionsCount = 0;

	private editor: CodeMirror.Editor;

    static $inject = ["$scope", "$rootScope"];
    constructor(private $scope: angular.IScope, private $rootScope: angular.IScope) {
        $scope['mc'] = this;
        $scope['editorOptions'] = {
            lineWrapping: true,
            lineNumbers: true,
            readOnly: false,
            gutters: ['note-gutter']
        }
        $scope['codemirrorLoaded'] = (editor) => {
            this.editor = editor;
            console.log("Got editor");
            if (!editor.options.gutters) editor.gutters = [];
            editor.options.gutters.push("note-gutter");
        }
        //TODO: 
    }

    updateCode() {
		if (this.editor) {
			// this.editor.clearGutter("note-gutter");
			this.editor.getDoc().getAllMarks().forEach(mark => mark.clear())
		}
		this.codeError = "";
		this.instructionsCount = 0;
		if (this.interpreter && this.interpreter.pauseExecution) {
			this.interpreter.pauseExecution()
		}
		try {
			this.interpreter = new MarieInterpreter(this.code);
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
			this.codeError = "Error on Line " + err.lineNumber + ": " + (<CompilerError>err).errorstring;
			this.lineError = (<CompilerError>err).lineNumber - 1
			this.objectError = (<CompilerError>err).object;
			console.log("had error", this.editor, this.lineError, this.codeError);
			if (this.editor) {
				console.log("found editor object");
				// var icon = document.createElement("p");
				// icon.className = "fa fa-exclamation-circle note-gutter-text";
				// var lm = this.editor.setGutterMarker(this.lineError, "note-gutter", icon);
				// console.log(lm);
				// this.editor.doc.addLineClass(this.lineError, "text", "line-error");
				var line = this.editor.getDoc().getLine(this.lineError);
				var char = line.indexOf(this.objectError);
				if (char != -1)
					this.editor.getDoc().markText({ line: this.lineError, ch: char }, { line: this.lineError, ch: char + this.objectError.length }, { className: "line-error" });
				else {
					this.editor.getDoc().markText({ line: this.lineError, ch: 0 }, { line: this.lineError, ch: line.length }, { className: "line-error" });
				}
				this.safeApply();
			}
		}
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
							<td ng-if="viewtype == 'HEX'" ng-repeat="col in cols" ng-class="{flash:onChange[row+col]}">
								<span ng-if="viewtype == 'HEX'">{{memory[row + col] | toHex | padHex:4}}</span>
								<span ng-if="viewtype == 'ASCII'">{{memory[row + col] | toASCII}}</span>
								<span ng-if="viewtype == 'DEC'">{{memory[row + col]}}</span>
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