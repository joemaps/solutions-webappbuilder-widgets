///////////////////////////////////////////////////////////////////////////
// Copyright © 2015 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define(['jimu/BaseWidget', 'jimu/LayerInfos/LayerInfoFactory', 'jimu/LayerInfos/LayerInfos', 'jimu/utils',
    'dojo/dom', 'dojo/dom-class', 'dojo/dom-construct', 'dojo/on', 'dojo/dom-style', 'dojo/_base/declare', 'dojo/_base/xhr', 'dojo/_base/Color', 'dojo/_base/lang', 'dojo/_base/html', 'dojo/promise/all', 'dojo/topic', 'dojo/_base/array',
    'dijit/_WidgetsInTemplateMixin',    
    'esri/dijit/PopupTemplate', 'esri/graphic', 'esri/request', 'esri/geometry/Point', 'esri/layers/FeatureLayer', 'esri/layers/WebTiledLayer', 'esri/tasks/query', 'esri/tasks/QueryTask',
    './js/ClusterLayer', './js/ThemeColorManager', './js/LayerVisibilityManager'
],
function (BaseWidget, LayerInfoFactory, LayerInfos, utils,
    dom, domClass, domConstruct, on, domStyle, declare, xhr, Color, lang, html, all, topic, array,
    _WidgetsInTemplateMixin, 
    PopupTemplate, Graphic, esriRequest, Point, FeatureLayer, WebTiledLayer, Query, QueryTask,
    ClusterLayer, ThemeColorManager, LayerVisibilityManager
  ) {
    return declare([BaseWidget, _WidgetsInTemplateMixin], {
        baseClass: 'jimu-widget-511',

        name: "511",
        _hasContent: null,
        opLayers: null,
        layerList: {},
        uniqueAppendVal: "_CL",
        widgetChange: false,
        layerVisibilityManager: null,
        refreshInterval: null,
        queries: [],
        queryLayers: [],

        postCreate: function () {
            this.inherited(arguments);
            this._hasContent = this.config && this.config.mainPanelIcon;
        },

        startup: function () {
            console.log("start");
            this.inherited(arguments);
            this.own(on(this.map, "extent-change", lang.hitch(this, this._mapExtentChange)));
        },

        onOpen: function () {
            this.widgetChange = false;
            console.log("onOpen");

            //populates this.opLayers from this.map
            this._getOpLayers();

            //_createPanelUI:
            // create the main widget UI
            // update this.layerList based on the layers that have been configured as widget sources
            // create cluster layers for any point layers that are in this.layerList
            this.layerList = {};
            this._createPanelUI(this.config.layerInfos);

            //helps turn on/off layers when the widget is opened and closed
            //when initialized LayerVisibilityManager will turn off all opLayers that are not being consumed by the widget
            this.layerVisibilityManager = new LayerVisibilityManager({
                map: this.map,
                configLayerList: this.layerList,
                parent: this
            });

            //if refresh is enabled set refereshInterval on all widget source layers
            //and call setInterval to refresh the static graphics in the cluster layers
            if (this.config.refreshEnabled) {
                this.enableRefresh();
            }
        },

        enableRefresh: function () {
            //set refreshItereval on all widget source layers that support it
            var lyr = null;
            for (var key in this.layerList) {
                var lyr = this.layerList[key];
                if (lyr.type !== "ClusterLayer") {
                    lyr = lyr.layerObject;
                }
                else {
                    var sourceLayerID = lyr.layerObject.id.replace(this.uniqueAppendVal, "");
                    for (var i = 0; i < this.opLayers.length; i++) {
                        var l = this.opLayers[i];
                        if (l.layerObject) {
                            lyr = l.layerObject;
                            break;
                        }
                    }
                }
                if (lyr) {
                    if (typeof (lyr.refreshInterval) !== 'undefined') {
                        lyr.refreshInterval = this.config.refreshInterval;
                    }
                }
            }

            //refresh the cluster layers at the same interval
            this.refreshInterval = setInterval(lang.hitch(this, this.refreshClusterLayers), (this.config.refreshInterval * 60000));
        },

        refreshClusterLayers: function(){
            for (var key in this.layerList) {
                var lyr = this.layerList[key];
                if (lyr.type === "ClusterLayer") {
                    lyr.layerObject.refreshFeatures();
                }
            }      
        },

        _getOpLayers: function () {
            if (this.map.itemId) {
                LayerInfos.getInstance(this.map, this.map.itemInfo)
                  .then(lang.hitch(this, function (operLayerInfos) {
                      this.opLayers = operLayerInfos._operLayers;
                  }));
            }
        },

        _createPanelUI: function (layerInfos) {
            var panelTitle = this.config.mainPanelText;
            if (typeof(panelTitle) === 'undefined') {
                panelTitle = "";
            }
            this.pageTitle.innerHTML = panelTitle;
            this.panelMainIcon.innerHTML = this.config.mainPanelIcon;

            this._updateUI(null);
            this._clearChildNodes(this.pageMain);

            for (var i = 0; i < layerInfos.length; i++) {
                var lyrInfo = layerInfos[i];
                var potentialClusterId = lyrInfo.id + this.uniqueAppendVal;
                if (lyrInfo.use) {
                    this._createLayerListItem(lyrInfo);
                }
            }

            if (this.queries.length > 0 && this.queryLayers.length > 0) {
                promises = all(this.queries);
                this.p = setTimeout(lang.hitch(this, promises.then(lang.hitch(this, function (results) {
                    if (results) {
                        for (var i = 0; i < results.length; i++) {
                            var ql = this.queryLayers[i];
                            var id = ql.layer.id;
                            if (!(id in this.layerList)) {
                                this.layerList[id] = {
                                    type: ql.type,
                                    layerObject: ql.layer,
                                    visible: true,
                                    queryIds: results[i]
                                };
                                this._addPanelItem(ql.layer, ql.lyrInfo);
                            } else {
                                this.layerList[id].queryIds = results[i];
                            }
                        }
                        this.p = null;
                        this._mapExtentChange();
                        console.log("PROMISES PROMISES");
                    }
                }))), 60000);
            }

            this._mapExtentChange();
        },

        _createLayerListItem: function (lyrInfo) {
            for (var ii = 0; ii < this.opLayers.length; ii++) {
                var layer = this.opLayers[ii];
                var layerGeomType = "";
                if (layer.layerType === "ArcGISFeatureLayer") {
                    if (layer.layerObject && layer.id === lyrInfo.id) {
                        this._updateLayerList(layer, lyrInfo, "Feature Layer");
                        break;
                    } else if (layer.featureCollection) {
                        for (var iii = 0; iii < layer.featureCollection.layers.length; iii++) {
                            var lyr = layer.featureCollection.layers[iii];
                            if (lyr.id === lyrInfo.id) {
                                this._updateLayerList(lyr, lyrInfo, "Feature Collection");
                                break;
                            }
                        }
                    }
                }
            }
        },

        _updateLayerList: function (lyr, lyrInfo, lyrType) {
            var l = null;
            if (lyr.layerObject.geometryType === "esriGeometryPoint") {
                var potentialNewID = lyrInfo.id + this.uniqueAppendVal;
                if (this.map.graphicsLayerIds.indexOf(potentialNewID) > -1) {
                    l = this.map.getLayer(potentialNewID);
                } else {
                    l = this._createClusterLayer(lyrInfo, lyr.layerObject);
                }
                this.layerList[l.id] = { type: "ClusterLayer", layerObject: l, visible: true };
            } else if (lyrType === "Feature Collection") {
                l = lyr.layerObject;
                this.layerList[l.id] = { type: lyrType, layerObject: l, visible: true };
            }
            else {
                var lo = lyr.layerObject;
                var query = new Query();
                query.where = "1=1";
                this.queries.push(lo.queryIds(query));
                this.queryLayers.push({layer: lo, type: lyrType, lyrInfo: lyrInfo});
            }
            if (l) {
                this._addPanelItem(l, lyrInfo);
            }
        },

        _addPanelItem: function (layer, lyrInfo, isCluster) {
            layer.setVisibility(true);

            var rec = domConstruct.create("div", {
                class: "rec"
            }, this.pageMain);
            var classNames = "recIcon";
            classNames += " active";
            var recIcon = domConstruct.create("div", {
                class: classNames,
                id: "recIcon_" + layer.id,
                innerHTML: lyrInfo.imageData
            }, rec);
            var recLabel = domConstruct.create("div", {
                class: "recLabel",
                innerHTML: "<p>" + lyrInfo.label + "</p>"
            }, rec);
            var recNum = domConstruct.create("div", {
                class: "recNum",
                id: "recNum_" + layer.id,
                innerHTML: ""
            }, rec);

            if (this.layerList[layer.id].type === "ClusterLayer") {
                layer.node = recNum;
                layer.clusterFeatures();
            }

            if (typeof (this.layerList[layer.id].queryIds) !== 'undefined') {
                recNum.innerHTML = this.layerList[layer.id].queryIds.length;
            }

            on(recIcon, "click", lang.hitch(this, this._toggleLayer, layer));
        },

        _createClusterLayer: function (lyrInfo, lyr) {
            var features = [];
            //var hasFeatures = lyr.graphics.length > 0 ? true : false;
            //if (hasFeatures) {
            //    for (var i = 0; i < lyr.graphics.length; i++) {
            //        features.push(lyr.graphics[i]);
            //    }
            //}

            //TODO if I just go this route at the start would only want to avoid the query
            // if it's a feature collection
            var hasFeatures = false;

            var n = domConstruct.toDom(lyrInfo.imageData);
            var options = {
                name: lyrInfo.label + this.uniqueAppendVal,
                id: lyrInfo.id + this.uniqueAppendVal,
                icon: n.src,
                map: this.map,
                node: dom.byId("recNum_" + lyrInfo.id + this.uniqueAppendVal),
                features: !hasFeatures ? lyrInfo.url : features,
                infoTemplate: lyr.infoTemplate,
                url: lyrInfo.url,
                refreshInterval: this.config.refreshInterval,
                refreshEnabled: this.config.refreshEnabled
            };
            domConstruct.destroy(n.id);

            var clusterLayer = new ClusterLayer(options);
            this.map.addLayer(clusterLayer);
            return clusterLayer;
        },

        _mapExtentChange: function () {
            var queries = [];
            var updateNodes = [];

            for (var key in this.layerList) {
                var lyr = this.layerList[key];
                //cluster layers will update the node on their own
                if (lyr.type !== 'ClusterLayer') {
                    if (typeof (lyr.layerObject) === 'undefined') {
                        console.log("A");
                    } else {

                        var node = dom.byId("recNum_" + lyr.layerObject.id);
                        var ext = this.map.extent;
                        if (lyr) {
                            if (lyr.type === "Feature Collection") {
                                node.innerHTML = this._checkCoincidence(ext, lyr.layerObject);
                            } else if (lyr.type === "Feature Layer") {
                                //TODO...getting from the graphics is faster
                                // however...I can't tell when it's in a valid vs invalid state
                                //comes up more with many features in single service tests 
                                //if (lyr.layerObject.graphics.length > 0) {
                                //    node.innerHTML = this._checkCoincidence(ext, lyr.layerObject);
                                //} else {

                                //TODO go to request also
                                var q = new Query();
                                q.geometry = ext;
                                q.returnGeometry = false;

                                var qt = new QueryTask(lyr.layerObject.url);
                                queries.push(qt.executeForIds(q));
                                updateNodes.push(node);
                            }
                        }
                    }
                }
            }

            if (queries.length > 0) {
                promises = all(queries);
                promises.then(function (results) {
                    for (var i = 0; i < results.length; i++) {
                        updateNodes[i].innerHTML = results[i].length;
                    }
                });
            }
        },

        _checkCoincidence: function (ext, lyr) {
            //test if the graphic intersects the extent
            // this will only be done for poly or line feature collection layers
            var featureCount = 0;
            for (var i = 0; i < lyr.graphics.length; i++) {
                featureCount += ext.intersects(lyr.graphics[i].geometry) ? 1 : 0;
            }
            return featureCount;
        },

        _updateUI: function (styleName) {
            var themeColorManager = new ThemeColorManager({
                updateNodes: [{
                    node: this.pageHeader,
                    styleProp: "background-color"
                }],
                layerList: this.layerList,
                theme: this.appConfig.theme,
                stylename: styleName
            });
        },

        _toggleLayer: function (obj) {
            this.map.infoWindow.hide();
            var id = obj.id;
            var lyr = this.layerList[obj.id];
            if (domClass.contains("recIcon_" + id, "active")) {
                domClass.remove("recIcon_" + id, "active");
                if (lyr) {
                    lyr.layerObject.setVisibility(false);
                    this.layerList[obj.id].visible = false;
                }
            } else {
                domClass.add("recIcon_" + id, "active");
                if (lyr) {
                    lyr.layerObject.setVisibility(true);
                    if (lyr.type === 'ClusterLayer') {
                        //TODO still need to wrok on that
                        //lyr.layerObject.flashFeatures();
                    }
                    
                    this.layerList[obj.id].visible = true;
                }
            }
        },

        onAppConfigChanged: function (appConfig, reason, changedData) {
            switch (reason) {
                case 'themeChange':
                case 'layoutChange':
                    this.destroy();
                    break;
                case 'styleChange':
                    this._updateUI(changedData);
                    break;
                case 'widgetChange':
                    this.widgetChange = true;
                    break;
            }
        },

        setPosition: function (position, containerNode) {
            if (this.appConfig.theme.name === "BoxTheme" || this.appConfig.theme.name === "DartTheme" ||
              this.appConfig.theme.name === "LaunchpadTheme") {
                this.inherited(arguments);
            } else {
                var pos = {
                    right: "0px",
                    top: "0px",
                    width: "50px",
                    bottom: "0px"
                };
                this.position = pos;
                var style = utils.getPositionStyle(this.position);
                style.position = 'absolute';
                containerNode = this.map.id;
                html.place(this.domNode, containerNode);
                html.setStyle(this.domNode, style);
            }
        },

        _close: function () {
            this.widgetManager.closeWidget(this.id);
        },

        onClose: function () {
            this.inherited(arguments);

            if (this.p) {
                console.log("need to clear p");
                clearTimeout(this.p);
                console.log("p cleared");
            }

            if (!this.widgetChange) {
                this._clearChildNodes(this.pageMain);
                this.layerVisibilityManager.resetLayerVisibility();
                this.layerList = {};
                this.queries = [];
                this.queryLayers = [];
                this.layerVisibilityManager = null;
            }
            if (this.refreshInterval) {
                clearInterval(this.refreshInterval);
            }
        },

        _clearChildNodes: function (parentNode) {
            while (parentNode.hasChildNodes()) {
                parentNode.removeChild(parentNode.lastChild);
            }
        }
    });
});