/*
 * ${copyright}
 */
sap.ui.define([
	"./PluginBase",
	"../utils/TableUtils",
	"sap/ui/unified/MenuItem",
	"sap/base/util/deepClone"
], function(
	PluginBase,
	TableUtils,
	MenuItem,
	deepClone
) {
	"use strict";

	function defaultGroupHeaderFormatter(oContext, mGroupLevelInfo) {
		var sResourceKey = "TBL_ROW_GROUP_TITLE";
		var aValues = [mGroupLevelInfo.property.label, oContext.getProperty(mGroupLevelInfo.property.path, true)];

		if (mGroupLevelInfo.textProperty) {
			sResourceKey = "TBL_ROW_GROUP_TITLE_FULL";
			aValues.push(oContext.getProperty(mGroupLevelInfo.textProperty.path, true));
		}

		return TableUtils.getResourceText(sResourceKey, aValues);
	}

	/**
	 * Constructs an instance of sap.ui.table.plugins.V4Aggregation
	 *
	 * @class TODO (don't forget to document fixed row count restrictions because fixed rows are set by this plugin)
	 * @extends sap.ui.table.plugins.PluginBase
	 * @author SAP SE
	 * @version ${version}
	 * @private
	 * @since 1.76
	 * @experimental
	 * @alias sap.ui.table.plugins.V4Aggregation
	 * @ui5-metamodel This control/element also will be described in the UI5 (legacy) designtime metamodel
	 */
	var V4Aggregation = PluginBase.extend("sap.ui.table.plugins.V4Aggregation", /** @lends sap.ui.table.plugins.V4Aggregation.prototype */ {
		metadata: {
			library: "sap.ui.table",
			properties: {
				// None, Top, FixedTop, Bottom, FixedBottom, TopAndBottom, FixedTopAndBottom, TopAndFixedBottom, FixedTopAndFixedBottom
				//totalSummary: {type: "string", defaultValue: "FixedBottom"},
				totalSummaryOnTop: {type: "string", defaultValue: "Off"}, // On, Off, Fixed
				totalSummaryOnBottom: {type: "string", defaultValue: "Fixed"}, // On, Off, Fixed
				groupSummary: {type: "string", defaultValue: "Bottom"}, // None, Top, Bottom, TopAndBottom
				//groupSummaryOnTop: {type: "string", defaultValue: "On"}, // On, Off
				//groupSummaryOnBottom: {type: "string", defaultValue: "Off"}, // On, Off

				/**
				 * If the formatter returns undefined, the default group header title is set.
				 *
				 * Parameters: Binding context (sap.ui.model.Context), Name of the grouped property (string)
				 * Returns: The group header title or undefined
				 */
				groupHeaderFormatter: {type: "function"}
			}
		}
	});

	/**
	 * @override
	 * @inheritDoc
	 */
	V4Aggregation.prototype.isApplicable = function(oControl) {
		return PluginBase.prototype.isApplicable.apply(this, arguments) && oControl.getMetadata().getName() === "sap.ui.table.Table";
	};

	/**
	 * @override
	 * @inheritDoc
	 */
	V4Aggregation.prototype.activate = function() {
		var oBinding = this.getTableBinding();

		if (oBinding && !oBinding.getModel().isA("sap.ui.model.odata.v4.ODataModel")) {
			return;
		}

		PluginBase.prototype.activate.apply(this, arguments);
	};

	/**
	 * @override
	 * @inheritDoc
	 */
	V4Aggregation.prototype.onActivate = function(oTable) {
		this.setRowCountConstraints({
			fixedTop: false,
			fixedBottom: false
		});
		TableUtils.Grouping.setGroupMode(oTable);
		TableUtils.Hook.register(oTable, TableUtils.Hook.Keys.Row.UpdateState, this.updateRowState, this);
		TableUtils.Hook.register(oTable, TableUtils.Hook.Keys.Row.Expand, expandRow, this);
		TableUtils.Hook.register(oTable, TableUtils.Hook.Keys.Row.Collapse, collapseRow, this);
	};

	/**
	 * @override
	 * @inheritDoc
	 */
	V4Aggregation.prototype.onDeactivate = function(oTable) {
		this.setRowCountConstraints();
		TableUtils.Grouping.clearMode(oTable);
		TableUtils.Hook.deregister(oTable, TableUtils.Hook.Keys.Row.UpdateState, this.updateRowState, this);
		TableUtils.Hook.deregister(this, TableUtils.Hook.Keys.Row.Expand, expandRow, this);
		TableUtils.Hook.deregister(this, TableUtils.Hook.Keys.Row.Collapse, collapseRow, this);

		var oBinding = oTable.getBinding();
		if (oBinding) {
			oBinding.setAggregation();
		}
	};

	/**
	 * @override
	 * @inheritDoc
	 */
	V4Aggregation.prototype.onTableRowsBound = function(oBinding) {
		// TODO: Check whether the plugin is correctly (de)activated in all possible cases and write tests.
		//  For example:
		//   - if the plugin is not active because there is no ODataV4 model yet, it won't be activated if that model is added later
		//   - on unbind
		//  Consider calling binding-related hooks also on inactive plugins for this purpose (check usage in selection plugins).
		if (oBinding.getModel().isA("sap.ui.model.odata.v4.ODataModel")) {
			this.updateAggregation();
		} else {
			this.deactivate();
		}
	};

	V4Aggregation.prototype.updateRowState = function(oState) {
		var iLevel = oState.context.getValue("@$ui5.node.level");
		var bContainsTotals = oState.context.getValue("@$ui5.node.isTotal");
		var bIsLeaf = oState.context.getValue("@$ui5.node.isExpanded") === undefined;
		var bIsGrandTotal = iLevel === 0 && bContainsTotals;
		var bIsGroupHeader = iLevel > 0 && !bIsLeaf;
		var bIsGroupTotal = !bIsGroupHeader && bContainsTotals;

		if (bIsGrandTotal || bIsGroupTotal) {
			oState.type = oState.Type.Summary;
		} else if (bIsGroupHeader) {
			oState.type = oState.Type.GroupHeader;
		}

		oState.expandable = bIsGroupHeader;
		oState.expanded = oState.context.getValue("@$ui5.node.isExpanded") === true;
		oState.level = iLevel;

		if (bIsGroupHeader) {
			var mGroupLevelInfo = this._aGroupLevels[iLevel - 1];
			var fnGroupHeaderFormatter = this.getGroupHeaderFormatter();
			var sCustomGroupHeaderTitle = fnGroupHeaderFormatter ? fnGroupHeaderFormatter(oState.context, mGroupLevelInfo.property.name) : undefined;

			if (sCustomGroupHeaderTitle === undefined) {
				oState.title = defaultGroupHeaderFormatter(oState.context, mGroupLevelInfo);
			} else if (typeof sCustomGroupHeaderTitle !== "string") {
				throw new Error("The group header title must be a string or undefined");
			} else {
				oState.title = sCustomGroupHeaderTitle;
			}
		}
	};

	V4Aggregation.prototype.setPropertyInfos = function(aPropertyInfos) {
		this._aPropertyInfos = aPropertyInfos;
	};

	V4Aggregation.prototype.getPropertyInfos = function() {
		return this._aPropertyInfos || [];
	};

	/**
	 * Retrieves a propertyInfo from its name.
	 *
	 * @param {string} sPropertyName name of the propertyInfo to be found
	 * @returns {object} the proprty info with the corresponding name, or null
	 */
	V4Aggregation.prototype.findPropertyInfo = function(sPropertyName) {
		return this.getPropertyInfos().find(function(oPropertyInfo) {
			return oPropertyInfo.name === sPropertyName;
		});
	};

	/**
	 * Checks if a propertyInfo corresponds to an aggregatable property.
	 *
	 * @param {object} oPropertyInfo the property info
	 * @returns {boolean} true if the propertyInfo corresponds to an aggregatable property, false otherwise
	 */
	V4Aggregation.prototype.isPropertyAggregatable = function(oPropertyInfo) {
		return (oPropertyInfo.extension && oPropertyInfo.extension.defaultAggregate) ? true : false;
	};

	/**
	 * Sets aggregation info and derives the query options to be passed to the table list binding.
	 *
	 * @param {object} oAggregateInfo An object holding the information needed for data aggregation
	 * @param {Array} oAggregateInfo.visible An array of property info names, containing the list of visible properties
	 * @param {Array} oAggregateInfo.groupLevels An array of groupable property info names used to determine group levels (visual grouping).
	 * @param {Array} oAggregateInfo.subtotals  An array of aggregatable property info names for which the subtotals are displayed
	 * @param {Array} oAggregateInfo.grandTotal  An array of aggregatable property info names for which the grand total is displayed
	 */
	V4Aggregation.prototype.setAggregationInfo = function(oAggregateInfo) {
		if (!oAggregateInfo || !Array.isArray(oAggregateInfo.visible)) {
			this._mGroup = undefined;
			this._mAggregate = undefined;
			this._aGroupLevels = undefined;
		} else {
			var aAllUnitProperties = [];
			var aAllAdditionalProperties = [];
			var aAdditionalProperties;

			// Always use keys in the properties to be grouped
			this._mGroup = this.getPropertyInfos().reduce(function(mGroup, oPropertyInfo) {
				if (oPropertyInfo.key) {
					mGroup[oPropertyInfo.path] = {};
					aAdditionalProperties = getAdditionalPropertyPaths(this, oPropertyInfo);
					if (aAdditionalProperties) {
						mGroup[oPropertyInfo.path].additionally = aAdditionalProperties;
						aAllAdditionalProperties.concat(aAdditionalProperties);
					}
				}
				return mGroup;
			}.bind(this), {});

			this._mAggregate = {};

			// Find grouped and aggregated properties
			oAggregateInfo.visible.forEach(function(sVisiblePropertyName) {
				var oPropertyInfo = this.findPropertyInfo(sVisiblePropertyName);
				if (oPropertyInfo && oPropertyInfo.groupable) {
					this._mGroup[oPropertyInfo.path] = {};
					aAdditionalProperties = getAdditionalPropertyPaths(this, oPropertyInfo);
					if (aAdditionalProperties) {
						this._mGroup[oPropertyInfo.path].additionally = aAdditionalProperties;
						aAllAdditionalProperties = aAllAdditionalProperties.concat(aAdditionalProperties);
					}
				}

				if (oPropertyInfo && this.isPropertyAggregatable(oPropertyInfo)) {
					this._mAggregate[oPropertyInfo.path] = {
						grandTotal: oAggregateInfo.grandTotal && (oAggregateInfo.grandTotal.indexOf(sVisiblePropertyName) >= 0),
						subtotals: oAggregateInfo.subtotals && (oAggregateInfo.subtotals.indexOf(sVisiblePropertyName) >= 0)
					};

					if (oPropertyInfo.unit) {
						var oUnitPropertyInfo = this.findPropertyInfo(oPropertyInfo.unit);
						if (oUnitPropertyInfo) {
							this._mAggregate[oPropertyInfo.path].unit = oUnitPropertyInfo.path;
							aAllUnitProperties.push(oUnitPropertyInfo.path);
						}
					}

					if (oPropertyInfo.extension.defaultAggregate.contextDefiningProperties) {
						oPropertyInfo.extension.defaultAggregate.contextDefiningProperties.forEach(function(sContextDefiningPropertyName) {
							var oDefiningPropertyInfo = this.findPropertyInfo(sContextDefiningPropertyName);
							if (oDefiningPropertyInfo) {
								this._mGroup[oDefiningPropertyInfo.path] = {};
								aAdditionalProperties = getAdditionalPropertyPaths(this, oPropertyInfo);
								if (aAdditionalProperties) {
									this._mGroup[oDefiningPropertyInfo.path].additionally = aAdditionalProperties;
									aAllAdditionalProperties = aAllAdditionalProperties.concat(aAdditionalProperties);
								}
							}
						}.bind(this));
					}
				}
			}.bind(this));

			// Handle group levels
			this._aGroupLevels = [];
			if (oAggregateInfo.groupLevels) {
				oAggregateInfo.groupLevels.forEach(function(sGroupLevelName) {
					var oProperty = this.findPropertyInfo(sGroupLevelName);
					this._aGroupLevels.push({
						property: oProperty,
						textProperty: this.findPropertyInfo(oProperty.text)
					});
				}.bind(this));
			}

			// Sanitize the aggregation info
			Object.keys(this._mGroup).forEach(function(sKey) {
				// A property may not be in both "group" and "aggregate".
				if (this._mAggregate.hasOwnProperty(sKey)) {
					if (this._mAggregate[sKey].grandTotal || this._mAggregate[sKey].subtotals) {
						delete this._mGroup[sKey];
						return;
					} else {
						delete this._mAggregate[sKey];
					}
				}

				// A property may not be in "group.additionally" if it is in "aggregation.unit".
				if (this._mGroup[sKey].additionally) {
					this._mGroup[sKey].additionally = this._mGroup[sKey].additionally.filter(function(sAdditionalProperty) {
						return aAllUnitProperties.indexOf(sAdditionalProperty) === -1;
					});
				}

				// A property may not be in "group" if it is in "group.additionally".
				if (aAllAdditionalProperties.indexOf(sKey) > -1) {
					delete this._mGroup[sKey];
				}
			}.bind(this));
		}

		this.updateAggregation();
	};

	V4Aggregation.prototype.getAggregationInfo = function() {
		var mAggregation = {
			aggregate: deepClone(this._mAggregate),
			group: deepClone(this._mGroup),
			groupLevels: this._aGroupLevels ? this._aGroupLevels.map(function(mGroupLevelInfo) {
				return mGroupLevelInfo.property.path;
			}) : undefined
		};

		if (mAggregation.aggregate) {
			handleGrandTotals(this, mAggregation);
			handleGroupTotals(this, mAggregation);
		}

		return mAggregation;
	};

	function getAdditionalPropertyPaths(oPlugin, oPropertyInfo) {
		if (oPropertyInfo.text) {
			var oTextPropertyInfo = oPlugin.findPropertyInfo(oPropertyInfo.text);
			if (oTextPropertyInfo) {
				return [oTextPropertyInfo.path];
			}
		}

		return null;
	}

	function expandRow(oRow) {
		var oBindingContext = oRow.getRowBindingContext();

		if (oBindingContext) {
			oBindingContext.expand();
		}
	}

	function collapseRow(oRow) {
		var oBindingContext = oRow.getRowBindingContext();

		if (oBindingContext) {
			oBindingContext.collapse();
		}
	}

	/*
	 * @see JSDoc generated by SAPUI5 control API generator
	 */
	V4Aggregation.prototype.setTotalSummaryOnTop = function(sValue) {
		this.setProperty("totalSummaryOnTop", sValue, true);
		this.updateAggregation();
	};

	/*
	 * @see JSDoc generated by SAPUI5 control API generator
	 */
	V4Aggregation.prototype.setTotalSummaryOnBottom = function(sValue) {
		this.setProperty("totalSummaryOnBottom", sValue, true);
		this.updateAggregation();
	};

	/*
	 * @see JSDoc generated by SAPUI5 control API generator
	 */
	V4Aggregation.prototype.setGroupSummary = function(sValue) {
		this.setProperty("groupSummary", sValue, true);
		this.updateAggregation();
	};

	V4Aggregation.prototype.updateAggregation = function() {
		var oBinding = this.getTableBinding();

		if (oBinding) {
			oBinding.setAggregation(this.getAggregationInfo());
		}
	};

	function handleGrandTotals(oPlugin, mAggregation) {
		var sTotalSummaryOnTop = oPlugin.getTotalSummaryOnTop();
		var sTotalSummaryOnBottom = oPlugin.getTotalSummaryOnBottom();
		var bShowTotalSummaryOnTop = sTotalSummaryOnTop === "On" || sTotalSummaryOnTop === "Fixed";
		var bShowTotalSummaryOnBottom = sTotalSummaryOnBottom === "On" || sTotalSummaryOnBottom === "Fixed";
		var bHasGrandTotals = Object.keys(mAggregation.aggregate).some(function(sKey) {
			return mAggregation.aggregate[sKey].grandTotal;
		});

		if (bShowTotalSummaryOnTop && bShowTotalSummaryOnBottom) {
			mAggregation.grandTotalAtBottomOnly = false;
		} else if (bShowTotalSummaryOnBottom) {
			mAggregation.grandTotalAtBottomOnly = true;
		} else if (bShowTotalSummaryOnTop) {
			mAggregation.grandTotalAtBottomOnly = undefined;
		} else {
			Object.keys(mAggregation.aggregate).forEach(function(sKey) {
				delete mAggregation.aggregate[sKey].grandTotal;
			});
		}

		oPlugin.setRowCountConstraints({
			fixedTop: sTotalSummaryOnTop === "Fixed" && bHasGrandTotals,
			fixedBottom: sTotalSummaryOnBottom === "Fixed" && bHasGrandTotals
		});
	}

	function handleGroupTotals(oPlugin, mAggregation) {
		var sGroupSummary = oPlugin.getGroupSummary();

		if (sGroupSummary === "Top") {
			mAggregation.subtotalsAtBottomOnly = undefined;
		} else if (sGroupSummary === "Bottom") {
			mAggregation.subtotalsAtBottomOnly = true;
		} else if (sGroupSummary === "TopAndBottom") {
			mAggregation.subtotalsAtBottomOnly = false;
		} else {
			Object.keys(mAggregation.aggregate).forEach(function(sKey) {
				delete mAggregation.aggregate[sKey].subtotals;
			});
		}
	}

	return V4Aggregation;
});