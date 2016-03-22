///<reference path="../typings/tsd.d.ts"/>

var app = angular.module("mariejs", []);

class MainController {
	interpreter: MarieInterpreter;
	code: string = `LOAD a
ADD b
OUTPUT
HALT
a, DEC 10
b, DEC 15`;
	codeError: string = "";
	
	private debounceTimer = 0;
	public instructionsCount = 0;

	static $inject = ["$scope", "$rootScope"];
	constructor(private $scope: angular.IScope, private $rootScope: angular.IScope) {
		$scope['mc'] = this;
	}

	updateCode() {
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
				this.debounceTimer = setTimeout(this.safeApply.bind(this),5);
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
			this.codeError = err.message;
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
			memory: '='
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
					<td ng-repeat="col in cols" ng-class="{flash:onChange[row+col]}">{{memory[row + col] | toHex | padHex:4}}</td>
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
				},50);
			})
		}]
	};
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