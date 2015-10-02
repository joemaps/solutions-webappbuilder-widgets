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
    './js/ClusterLayer', './js/FeatureCollectionLayer', './js/ThemeColorManager', './js/LayerVisibilityManager'
],
function (BaseWidget, LayerInfoFactory, LayerInfos, utils,
    dom, domClass, domConstruct, on, domStyle, declare, xhr, Color, lang, html, all, topic, array,
    _WidgetsInTemplateMixin, 
    PopupTemplate, Graphic, esriRequest, Point, FeatureLayer, WebTiledLayer, Query, QueryTask,
    ClusterLayer, FeatureCollectionLayer, ThemeColorManager, LayerVisibilityManager
  ) {
    return declare([BaseWidget, _WidgetsInTemplateMixin], {
        baseClass: 'jimu-widget-511',

        name: "511",
        opLayers: null,
        layerList: {},
        UNIQUE_APPEND_VAL_CL: "_CL",
        UNIQUE_APPEND_VAL_FC: "_FCGL",
        widgetChange: false,
        layerVisibilityManager: null,
        refreshInterval: null,
        queries: [],
        queryLayers: [],
        lInfos: [],

        postCreate: function () {
            this.inherited(arguments);
        },

        startup: function () {
            this.inherited(arguments);

            lInfos = this.config.layerInfos.reverse();
        },

        onOpen: function () {
            this.widgetChange = false;

            //populates this.opLayers from this.map
            this._getOpLayers();

            //_createPanelUI:
            // create the main widget UI
            // update this.layerList based on the layers that have been configured as widget sources
            // create cluster layers for any point layers that are in this.layerList
            this.layerList = {};

            this._createPanelUI(lInfos);

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
                if (lyr.type !== "ClusterLayer" || lyr.type !== "FeatureCollectionLayer") {
                    lyr = lyr.layerObject;
                } else {
                    var id = lyr.layerObject.id;
                    var lenID = id.length;
                    var sourceLayerID = id.replace(this.UNIQUE_APPEND_VAL_CL, "");
                    if (lenID === sourceLayerID.length) {
                        sourceLayerID = id.replace(this.UNIQUE_APPEND_VAL_FC, "");
                    }
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
            this.refreshInterval = setInterval(lang.hitch(this, this.refreshLayers), (this.config.refreshInterval * 60000));
        },

        refreshLayers: function(){
            for (var key in this.layerList) {
                var lyr = this.layerList[key];
                if (lyr.type === "ClusterLayer" || lyr.type === "FeatureCollectionLayer") {
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
                if (lyrInfo.use) {
                    this._createLayerListItem(lyrInfo);
                }
            }
        },

        _createLayerListItem: function (lyrInfo) {
            //TODO make change for map server services

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
                l = this._getClusterLayer(lyrInfo, lyr.layerObject);
                this.layerList[l.id] = { type: "ClusterLayer", layerObject: l, visible: true };
            } else {
                l = this._createFeatureCollectionLayer(lyrInfo, lyr.layerObject, lyrType);
                this.layerList[l.id] = { type: "FeatureCollectionLayer", layerObject: l, visible: true, pl: lyr };
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

            if (this.layerList[layer.id].type === "FeatureCollectionLayer") {
                layer.node = recNum;
                layer.countFeatures();
            }

            on(recIcon, "click", lang.hitch(this, this._toggleLayer, layer));
            on(recIcon, "click", lang.hitch(this, this._showLegend, layer));
            on(rec, "right-click", lang.hitch(this, this._showMenu, layer));
        },

        _getClusterLayer: function (lyrInfo, lyr, lyrType) {
            var clusterLayer = null;
            var potentialNewID = lyrInfo.id + this.UNIQUE_APPEND_VAL_CL;
            if (this.map.graphicsLayerIds.indexOf(potentialNewID) > -1) {
                clusterLayer = this.map.getLayer(potentialNewID);
            } else {
                var features = [];
                var hasFeatures = (lyrType === "Feature Collection") ? true : false;
                var n = domConstruct.toDom(lyrInfo.imageData);
                var options = {
                    name: lyrInfo.label + this.UNIQUE_APPEND_VAL_CL,
                    id: potentialNewID,
                    icon: n.src,
                    map: this.map,
                    node: dom.byId("recNum_" + potentialNewID),
                    features: !hasFeatures ? undefined : features,
                    infoTemplate: lyr.infoTemplate,
                    url: lyrInfo.url,
                    refreshInterval: this.config.refreshInterval,
                    refreshEnabled: this.config.refreshEnabled
                };
                domConstruct.destroy(n.id);

                clusterLayer = new ClusterLayer(options);
                this.map.addLayer(clusterLayer);   
            }
            return clusterLayer;
        },

        //options: {name: "", map: map, id: "", renderer: <sourceLayerRenderer>, node: <updateNode>, features: <optional if url is supplied>, infoTemplate: <infoTemplate>}
        _createFeatureCollectionLayer: function (lyrInfo, lyr, lyrType) {
            var featureCollectionLayer = null;
            var potentialNewID = lyrInfo.id + this.UNIQUE_APPEND_VAL_CL;
            if (this.map.graphicsLayerIds.indexOf(potentialNewID) > -1) {
                featureCollectionLayer = this.map.getLayer(potentialNewID);
            } else {
                //TODO...the other option would be to avoid this on actual FeatureCollection layer type
                // main advantage to this approach is that we can count and flash easily
                var features = [];
                var hasFeatures = (lyrType === "Feature Collection") ? true : false;
                var n = domConstruct.toDom(lyrInfo.imageData);
                var options = {
                    name: lyrInfo.label + this.UNIQUE_APPEND_VAL_FC,
                    id: lyrInfo.id + this.UNIQUE_APPEND_VAL_FC,
                    icon: n.src,
                    map: this.map,
                    renderer: lyr.renderer,
                    node: dom.byId("recNum_" + lyrInfo.id + this.UNIQUE_APPEND_VAL_FC),
                    features: !hasFeatures ? undefined : lyr.graphics,
                    infoTemplate: lyr.infoTemplate,
                    url: lyrInfo.url,
                    refreshInterval: this.config.refreshInterval,
                    refreshEnabled: this.config.refreshEnabled
                };
                domConstruct.destroy(n.id);

                var featureCollectionLayer = new FeatureCollectionLayer(options);
                this.map.addLayer(featureCollectionLayer);
            }
            return featureCollectionLayer;

        },

        ////TODO...neither of these will be necessary if the layers update the nodes
        //_mapExtentChange: function () {
        //    var queries = [];
        //    var updateNodes = [];

        //    for (var key in this.layerList) {
        //        var lyr = this.layerList[key];
        //        //cluster layers will update the node on their own
        //        if (lyr.type !== 'ClusterLayer') {
        //            if (typeof (lyr.layerObject) === 'undefined') {
        //                console.log("A");
        //            } else {

        //                var node = dom.byId("recNum_" + lyr.layerObject.id);
        //                var ext = this.map.extent;
        //                if (lyr) {
        //                    if (lyr.type === "Feature Collection") {
        //                        node.innerHTML = this._checkCoincidence(ext, lyr.layerObject);
        //                    } else if (lyr.type === "Feature Layer") {
        //                        //TODO...getting from the graphics is faster
        //                        // however...I can't tell when it's in a valid vs invalid state
        //                        //comes up more with many features in single service tests 
        //                        //if (lyr.layerObject.graphics.length > 0) {
        //                        //    node.innerHTML = this._checkCoincidence(ext, lyr.layerObject);
        //                        //} else {


        //                        //TODO go to request also
        //                        var q = new Query();
        //                        q.geometry = ext;
        //                        q.returnGeometry = false;

        //                        var qt = new QueryTask(lyr.layerObject.url);
        //                        queries.push(qt.executeForIds(q));
        //                        updateNodes.push(node);
        //                    }
        //                }
        //            }
        //        }
        //    }

        //    if (queries.length > 0) {
        //        promises = all(queries);
        //        promises.then(function (results) {
        //            for (var i = 0; i < results.length; i++) {
        //                updateNodes[i].innerHTML = results[i].length;
        //            }
        //        });
        //    }
        //},
        //TODO...neither of these will be necessary if the layers update the nodes
        //_checkCoincidence: function (ext, lyr) {
        //    //test if the graphic intersects the extent
        //    // this will only be done for poly or line feature collection layers
        //    var featureCount = 0;
        //    for (var i = 0; i < lyr.graphics.length; i++) {
        //        featureCount += ext.intersects(lyr.graphics[i].geometry) ? 1 : 0;
        //    }
        //    return featureCount;
        //},

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
                    if (typeof (lyr.pl) !== 'undefined') {
                        lyr.pl.visibility = false;
                        if (this.map.graphicsLayerIds.indexOf(obj.id) > -1) {
                            var l = this.map.getLayer(obj.id);
                            l.setVisibility(false);
                        }
                    }
                }
            } else {
                domClass.add("recIcon_" + id, "active");
                if (lyr) {
                    lyr.layerObject.setVisibility(true);
                    if (lyr.type === 'ClusterLayer' || lyr.type === 'FeatureCollectionLayer') {
                        //TODO still need to wrok on that
                        //lyr.layerObject.flashFeatures();
                    } 
                    this.layerList[obj.id].visible = true;
                    if (typeof (lyr.pl) !== 'undefined') {
                        lyr.pl.visibility = true;
                        if (this.map.graphicsLayerIds.indexOf(obj.id) > -1) {
                            var l = this.map.getLayer(obj.id);
                            l.setVisibility(true);
                        }
                    }
                }
            }
        },

        _showLegend: function (obj) {
            var id = obj.id;
            var lyr = this.layerList[obj.id];

            // expand and show the legend for this item

        },

        _showMenu: function (obj) {
            //show right click menu here 

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