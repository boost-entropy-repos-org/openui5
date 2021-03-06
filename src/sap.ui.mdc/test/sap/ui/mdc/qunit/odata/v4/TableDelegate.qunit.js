/* global QUnit, sinon */
sap.ui.define([
	"sap/ui/mdc/Table",
	"sap/ui/mdc/odata/v4/TableDelegate",
	"sap/ui/mdc/library",
	"../../../delegates/odata/v4/TableDelegate",
	"../../QUnitUtils",
	"../../util/createAppEnvironment",
	"sap/ui/core/UIComponent",
	"sap/ui/core/ComponentContainer",
	"sap/ui/fl/write/api/ControlPersonalizationWriteAPI",
	"sap/ui/core/Core"
], function(
	Table,
	TableDelegate,
	Library,
	TestDelegate,
	MDCQUnitUtils,
	createAppEnvironment,
	UIComponent,
	ComponentContainer,
	ControlPersonalizationWriteAPI,
	Core
) {
	"use strict";

	var TableType = Library.TableType;

	Core.loadLibrary("sap.ui.fl");

	var sTableView1 =
		'<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:m="sap.m" xmlns="sap.ui.mdc" xmlns:mdcTable="sap.ui.mdc.table">' +
		'<Table p13nMode="Group,Aggregate" id="myTable" delegate=\'\{ name : "sap/ui/mdc/odata/v4/TableDelegate", payload : \{ "collectionName" : "ProductList" \} \}\'>' +
		'<columns><mdcTable:Column id="myTable--column0" header="column 0" dataProperty="Name">' +
		'<m:Text text="{Name}" id="myTable--text0" /></mdcTable:Column>' +
		'<mdcTable:Column id="myTable--column1" header="column 1" dataProperty="Country">' +
		'<m:Text text="{Country}" id="myTable--text1" /></mdcTable:Column>' +
		'<mdcTable:Column header="column 2" dataProperty="name_country"> ' +
		'<m:Text text="{Name}" id="myTable--text2" /></mdcTable:Column></columns> ' +
		'</Table></mvc:View>';

	var sTableView2 =
		'<mvc:View xmlns:mvc="sap.ui.core.mvc" xmlns:m="sap.m" xmlns="sap.ui.mdc" xmlns:mdcTable="sap.ui.mdc.table">' +
		'<Table p13nMode="Group,Aggregate" id="myTable" delegate=\'\{ name : "sap/ui/mdc/odata/v4/TableDelegate", payload : \{ "collectionName" : "ProductList" \} \}\'>' +
		'<columns>' +
		'<mdcTable:Column header="column 2" dataProperty="name_country"> ' +
		'<m:Text text="{Name}" id="myTable--text2" /></mdcTable:Column></columns> ' +
		'</Table></mvc:View>';

	QUnit.module("Initialization");

	QUnit.test("GridTable", function(assert) {
		var oTable = new Table({
			delegate: {
				name: "sap/ui/mdc/odata/v4/TableDelegate"
			}
		});

		return oTable._fullyInitialized().then(function() {
			var oPlugin = oTable._oTable.getDependents()[0];
			assert.ok(oPlugin.isA("sap.ui.table.plugins.V4Aggregation"), "V4Aggregation plugin is added to the inner table");

			var oGroupHeaderFormatter = sinon.spy(TableDelegate, "formatGroupHeader");
			oPlugin.getGroupHeaderFormatter()("MyContext", "MyProperty");
			assert.ok(oGroupHeaderFormatter.calledOnceWithExactly(oTable, "MyContext", "MyProperty"), "Call Delegate.formatGroupHeader");

			oTable.destroy();
		});
	});

	QUnit.test("ResponsiveTable", function(assert) {
		var oTable = new Table({
			type: TableType.ResponsiveTable,
			delegate: {
				name: "sap/ui/mdc/odata/v4/TableDelegate"
			}
		});
		var bInitializationFailed = false;

		return oTable.initialized().catch(function() {
			bInitializationFailed = true;
		}).finally(function() {
			assert.ok(bInitializationFailed, "Initialization failed");
			assert.throws(function() {
				TableDelegate.preInit(oTable);
			}, new Error("This delegate does not support the table type 'ResponsiveTable'."), "Delegate.preInit throws error");
			oTable.destroy();
		});
	});

	QUnit.module("Basic functionality with JsControlTreeModifier", {
		before: function() {
			MDCQUnitUtils.stubPropertyInfos(Table.prototype, [{
				name: "Name",
				label: "Name",
				path: "Name",
				groupable: true
			}, {
				name: "Country",
				label: "Country",
				path: "Country",
				groupable: true
			}, {
				name: "name_country",
				label: "Complex Title & Description",
				propertyInfos: ["Name", "Country"]
			}]);
			MDCQUnitUtils.stubPropertyExtension(Table.prototype, {
				Name: {
					defaultAggregate: {}
				},
				Country: {
					defaultAggregate: {}
				}
			});
		},
		beforeEach: function() {
			return this.createTestObjects().then(function() {
				return this.oTable.getEngine().getModificationHandler().waitForChanges({
					element: this.oTable
				});
			}.bind(this));
		},
		afterEach: function() {
			this.destroyTestObjects();
		},
		after: function() {
			MDCQUnitUtils.restorePropertyInfos(Table.prototype);
			MDCQUnitUtils.restorePropertyExtension(Table.prototype);
		},
		createTestObjects: function() {
			return createAppEnvironment(sTableView1, "Table").then(function(mCreatedApp){
				this.oView = mCreatedApp.view;
				this.oUiComponentContainer = mCreatedApp.container;
				this.oUiComponentContainer.placeAt("qunit-fixture");
				Core.applyChanges();

				this.oTable = this.oView.byId('myTable');

				ControlPersonalizationWriteAPI.restore({
					selector: this.oTable
				});
			}.bind(this));
		},
		destroyTestObjects: function() {
			this.oUiComponentContainer.destroy();
		}
	});

	QUnit.test("Allowed analytics on column header and tableDelegate API's", function(assert) {
		var fColumnPressSpy = sinon.spy(this.oTable, "_onColumnPress");
		var oResourceBundle = Core.getLibraryResourceBundle("sap.ui.mdc");
		var oTable = this.oTable;

		return oTable._fullyInitialized().then(function() {
			var oFirstInnerColumn = oTable._oTable.getColumns()[0];
			var oPlugin = oTable._oTable.getDependents()[0];
			var oDelegate = oTable.getControlDelegate();
			var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");

			oDelegate._setAggregation(oTable, {}, {});
			assert.strictEqual(fSetAggregationSpy.callCount, 0, "V4Aggregation#setAggregation is called only with right parameter type");

			oDelegate._setAggregation(oTable, [], ["Country"]);
			assert.ok(fSetAggregationSpy.calledOnceWithExactly({
				visible: oDelegate._getVisibleProperties(oTable, oPlugin),
				groupLevels: [],
				grandTotal: ["Country"],
				subtotals: ["Country"]
			}), "Plugin#setAggregationInfo call");
			fSetAggregationSpy.restore();

			oTable._oTable.fireEvent("columnSelect", {
				column: oFirstInnerColumn
			});
			assert.ok(fColumnPressSpy.calledOnce, "First Column pressed");
			fSetAggregationSpy.restore();
			return oTable._fullyInitialized();
		}).then(function() {
			var oThirdInnerColumn = oTable._oTable.getColumns()[2];

			assert.strictEqual(oTable._oPopover.getItems()[0].getLabel(), oResourceBundle.getText("table.SETTINGS_GROUP"),
				"The first column has group menu item");
			assert.strictEqual(oTable._oPopover.getItems()[1].getLabel(), oResourceBundle.getText("table.SETTINGS_TOTALS"),
				"The first column has aggregate menu item");

			oTable._oTable.fireEvent("columnSelect", {
				column: oThirdInnerColumn
			});
			return oTable._fullyInitialized();
		}).then(function() {
			var oPlugin = oTable._oTable.getDependents()[0];
			var oDelegate = oTable.getControlDelegate();
			var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");

			assert.strictEqual(fColumnPressSpy.callCount, 2, "Third Column pressed");
			assert.strictEqual(oTable._oPopover.getItems()[0].getItems().length,2, "The last column has complex property with list of two items");

			var oNewCol = new sap.ui.mdc.table.Column({
				id:"cl"
			});
			oTable.insertColumn(oNewCol, 2);
			oTable.setGroupConditions({
				groupLevels: [
					{
						"name": "Name"
					}
				]
			});
			oTable.rebind();
			assert.ok(fSetAggregationSpy.secondCall.calledWithExactly({
				visible: oDelegate._getVisibleProperties(oTable, oPlugin),
				groupLevels: ["Name"],
				grandTotal: [],
				subtotals: []
			}), "Plugin#setAggregationInfo call");
			fSetAggregationSpy.restore();
		});
	});

	QUnit.test("Grouping enabled on column press", function(assert) {
		var oTable = this.oTable;
		var done = assert.async();
		var fColumnPressSpy = sinon.spy(oTable, "_onColumnPress");

		 oTable._fullyInitialized().then(function() {
			var oInnerColumn = oTable._oTable.getColumns()[0];
			oTable._oTable.fireEvent("columnSelect", {
				column: oInnerColumn
			});
			assert.ok(fColumnPressSpy.calledOnce, "First column pressed");
			fColumnPressSpy.restore();

			setTimeout(function(){
				var oPlugin = oTable._oTable.getDependents()[0];
				var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
				var oDelegate = oTable.getControlDelegate();
				var fnRebindTable = oDelegate.rebindTable;

				oDelegate.rebindTable = function () {
					fnRebindTable.apply(this, arguments);
					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: oDelegate._getVisibleProperties(oTable, oPlugin),
						groupLevels: ["Name"],
						grandTotal: [],
						subtotals: []
					}), "Plugin#setAggregationInfo call");
					fSetAggregationSpy.restore();
					oDelegate.rebindTable = fnRebindTable;
					done();
				};
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[0].firePress();
			},0);

			//});
		});
	});

	QUnit.test("Aggregation enabled on column press", function(assert) {
		var oTable = this.oTable;
		var fColumnPressSpy = sinon.spy(oTable, "_onColumnPress");
		var done = assert.async();

		 oTable._fullyInitialized().then(function() {
			var oInnerSecondColumn = oTable._oTable.getColumns()[1];
			oTable._oTable.fireEvent("columnSelect", {
				column: oInnerSecondColumn
			});

			assert.ok(fColumnPressSpy.calledOnce, "First Column pressed");
			fColumnPressSpy.restore();

			oTable._fullyInitialized().then(function() {
				var oDelegate = oTable.getControlDelegate();
				var oPlugin = oTable._oTable.getDependents()[0];
				var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
				var fnRebindTable = oDelegate.rebindTable;

				oDelegate.rebindTable = function () {
					fnRebindTable.apply(this, arguments);
					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: oDelegate._getVisibleProperties(oTable, oPlugin),
						groupLevels: [],
						grandTotal: ["Country"],
						subtotals: ["Country"]
					}), "Plugin#setAggregationInfo call");
					fSetAggregationSpy.restore();
					oDelegate.rebindTable = fnRebindTable;
					done();
				};
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[1].firePress();
			});
		});
	});

	QUnit.test("Grouping and Aggregation on two columns", function(assert) {
		var oTable = this.oTable;
		var fColumnPressSpy = sinon.spy(oTable, "_onColumnPress");
		var done = assert.async();

		oTable._fullyInitialized().then(function() {
			var oInnerColumn = oTable._oTable.getColumns()[0];
			oTable._oTable.fireEvent("columnSelect", {
				column: oInnerColumn
			});
			assert.ok(fColumnPressSpy.calledOnce, "First Column pressed");

			oTable._fullyInitialized().then(function() {
				var oDelegate = oTable.getControlDelegate();
				var oPlugin = oTable._oTable.getDependents()[0];
				var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
				var fnRebindTable = oDelegate.rebindTable;
				var oInnerSecondColumn = oTable._oTable.getColumns()[1];

				oDelegate.rebindTable = function () {
					fnRebindTable.apply(this, arguments);
					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: oDelegate._getVisibleProperties(oTable, oPlugin),
						groupLevels: ["Name"],
						grandTotal: [],
						subtotals: []
					}), "Plugin#setAggregationInfo call");

					fColumnPressSpy.restore();
					fSetAggregationSpy.restore();
					oDelegate.rebindTable = fnRebindTable;
					oTable._oTable.fireEvent("columnSelect", {
						column: oInnerSecondColumn
					});

					oTable._fullyInitialized().then(function() {
						var oDelegate = oTable.getControlDelegate();
						var oPlugin = oTable._oTable.getDependents()[0];
						var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
						var fnRebindTable = oDelegate.rebindTable;

						oDelegate.rebindTable = function () {
							fnRebindTable.apply(this, arguments);
							assert.ok(fSetAggregationSpy.calledOnceWithExactly({
								visible: oDelegate._getVisibleProperties(oTable, oPlugin),
								groupLevels: ["Name"],
								grandTotal: ["Country"],
								subtotals: ["Country"]
							}), "Plugin#setAggregationInfo call");

							fColumnPressSpy.restore();
							fSetAggregationSpy.restore();
							oDelegate.rebindTable = fnRebindTable;
							done();
						};
						oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[1].firePress();
					});
				};
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[0].firePress();
			});
		});
	});

	QUnit.test("Grouping and forced aggregation", function(assert) {
		var oTable = this.oTable;
		var oDelegate;
		var oPlugin;
		var fSetAggregationSpy;
		var fnRebindTable;

		function openColumnMenu(oColumn) {
			oTable._oTable.fireEvent("columnSelect", {
				column: oColumn
			});

			// The popover is created async.
			return oTable._fullyInitialized();
		}

		return oTable._fullyInitialized().then(function() {
			oDelegate = oTable.getControlDelegate();
			oPlugin = oTable._oTable.getDependents()[0];
			fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
			fnRebindTable = oDelegate.rebindTable;

			return openColumnMenu(oTable._oTable.getColumns()[0]);
		}).then(function() {
			return new Promise(function(resolve) {
				oDelegate.rebindTable = function() {
					fnRebindTable.apply(this, arguments);

					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: oDelegate._getVisibleProperties(oTable, oPlugin),
						groupLevels: ["Name"],
						grandTotal: [],
						subtotals: []
					}), "Plugin#setAggregationInfo call");

					fSetAggregationSpy.reset();
					oDelegate.rebindTable = fnRebindTable;
					resolve();
				};
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[0].firePress();
			});
		}).then(function() {
			return openColumnMenu(oTable._oTable.getColumns()[0]);
		}).then(function() {
			return new Promise(function(resolve) {
				oDelegate.rebindTable = function() {
					fnRebindTable.apply(this, arguments);

					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: oDelegate._getVisibleProperties(oTable, oPlugin),
						groupLevels: [],
						grandTotal: ["Name"],
						subtotals: ["Name"]
					}), "Plugin#setAggregationInfo call");

					fSetAggregationSpy.reset();
					oDelegate.rebindTable = fnRebindTable;
					resolve();
				};
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[1].firePress();
				Core.byId(oTable.getId() + "-messageBox").getButtons()[0].firePress();
			});
		});
	});

	// This QUnit test is temporary and should be removed once the row count in toolbar has been re-enabled
	QUnit.test("Disable rowCount in table toolbar", function(assert) {
		var oTable = this.oTable;

		return oTable._fullyInitialized().then(function() {
			var sHeader = oTable.getHeader();
			assert.notOk(oTable.getShowRowCount(), "showRowCount=false");
			assert.ok(sHeader.indexOf("(") === -1 && sHeader.indexOf(")") === -1, "In the table header text there are no '()' that would contain the row count value ");
			oTable.setShowRowCount(true);
			Core.applyChanges();
			assert.notOk(oTable.getShowRowCount(), "showRowCount=false also after trying to set it to true");
		});
	});

	QUnit.module("Tests with specific propertyInfos and extensions for binding", {
		before: function() {
			MDCQUnitUtils.stubPropertyInfos(Table.prototype, [{
				name: "Name",
				label: "Name",
				path: "Name",
				groupable: true
			}, {
				name: "Country",
				label: "Country",
				path: "Country",
				groupable: true
			}, {
				name: "Value",
				label: "Value",
				path: "Value"
			}, {
				name: "name_country",
				label: "Complex Title & Description",
				propertyInfos: ["Name"]
			}]);
			MDCQUnitUtils.stubPropertyInfosForBinding(Table.prototype, [{
				name: "Name",
				label: "Name",
				path: "Name",
				groupable: true
			}, {
				name: "Country",
				label: "Country",
				path: "Country",
				groupable: true
			}, {
				name: "Value",
				label: "Value",
				path: "Value"
			}, {
				name: "name_country",
				label: "Complex Title & Description",
				propertyInfos: ["Name", "Country", "Value"]
			}]);
			MDCQUnitUtils.stubPropertyExtensionsForBinding(Table.prototype, {
				Value: {
					defaultAggregate: {}
				}
			});
		},
		beforeEach: function() {
			return this.createTestObjects().then(function() {
				return this.oTable.getEngine().getModificationHandler().waitForChanges({
					element: this.oTable
				});
			}.bind(this));
		},
		afterEach: function() {
			this.destroyTestObjects();
		},
		after: function() {
			MDCQUnitUtils.restorePropertyInfos(Table.prototype);
			MDCQUnitUtils.restorePropertyInfosForBinding(Table.prototype);
			MDCQUnitUtils.restorePropertyExtensionsForBinding(Table.prototype);
		},
		createTestObjects: function() {
			return createAppEnvironment(sTableView2, "Table").then(function(mCreatedApp){
				this.oView = mCreatedApp.view;
				this.oUiComponentContainer = mCreatedApp.container;
				this.oUiComponentContainer.placeAt("qunit-fixture");
				Core.applyChanges();

				this.oTable = this.oView.byId('myTable');

				ControlPersonalizationWriteAPI.restore({
					selector: this.oTable
				});
			}.bind(this));
		},
		destroyTestObjects: function() {
			this.oUiComponentContainer.destroy();
		}
	});

	QUnit.test("Check column header for analytics buttons", function(assert) {
		var fColumnPressSpy = sinon.spy(this.oTable, "_onColumnPress");
		var oResourceBundle = Core.getLibraryResourceBundle("sap.ui.mdc");
		var oTable = this.oTable;

		return oTable._fullyInitialized().then(function() {
			var oFirstInnerColumn = oTable._oTable.getColumns()[0];

			oTable._oTable.fireEvent("columnSelect", {
				column: oFirstInnerColumn
			});
			assert.ok(fColumnPressSpy.calledOnce, "First Column pressed");

			return oTable._fullyInitialized();
		}).then(function() {
			assert.strictEqual(oTable._oPopover.getItems()[0].getLabel(), oResourceBundle.getText("table.SETTINGS_GROUP"),
				"The first column has group menu item");
			assert.equal(oTable._oPopover.getItems().length, 1, "The first column doesn't have an aggregate menu item");
		});
	});

	QUnit.test("Apply group on column header", function(assert) {
		var oTable = this.oTable;
		var done = assert.async();
		var fColumnPressSpy = sinon.spy(oTable, "_onColumnPress");

		 oTable._fullyInitialized().then(function() {
			var oInnerColumn = oTable._oTable.getColumns()[0];
			oTable._oTable.fireEvent("columnSelect", {
				column: oInnerColumn
			});
			assert.ok(fColumnPressSpy.calledOnce, "First column pressed");
			fColumnPressSpy.restore();

			setTimeout(function(){
				var oPlugin = oTable._oTable.getDependents()[0];
				var fSetAggregationSpy = sinon.spy(oPlugin, "setAggregationInfo");
				var oDelegate = oTable.getControlDelegate();
				var fnRebindTable = oDelegate.rebindTable;

				oDelegate.rebindTable = function () {
					fnRebindTable.apply(this, arguments);
					assert.ok(fSetAggregationSpy.calledOnceWithExactly({
						visible: ["Name", "Country","Value"],
						groupLevels: ["Name"],
						grandTotal: [],
						subtotals: []
					}), "Plugin#setAggregationInfo call");
					fSetAggregationSpy.restore();
					oDelegate.rebindTable = fnRebindTable;
					done();
				};
				var fTableGroupSpy = sinon.spy(oTable, "_onCustomGroup");
				oTable._oPopover.getAggregation("_popover").getContent()[0].getContent()[0].firePress();
				assert.ok(fTableGroupSpy.calledOnce, "Column group triggered");
				if (!fTableGroupSpy.calledOnce) {
					done();	// rebindTable won't be called in this case, so we need to end the test here
				}
			},0);
		});
	});
});
