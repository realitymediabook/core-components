/**
 * Description
 * ===========
 * create a forcegraph component (using https://github.com/vasturiano/three-forcegraph)
 * that can be interacted with and has some networked attributes.  
 * 
 * A lot of this code is taken from the aframe-forcegraph-component in the same github user.
 *
 * To use in Spoke:
* -  width and height are the in-world max width and height around the center (width is x and z)
* - ignore the 3 "is" flags, no interactivity yet
* - ignore vueApp.  I using their "SpriteText", but it has some issues so I'm going to try switching to vueApps.  The GraphLabel vueApp is the default
* - jsonUrl:  the filename in the data repository, /forcegraph directory 
* - chargeForce is that force you used to spread the nodes, jay
* - x,y,z Force are the "push" toward 0 in that direction.  Here, I'm pushing slighty toward y to flatten the graph so it's not so tall
* - nodeId and node val are just their defaults, prob won't change, but I left them
* - nodeColor would be the field for the color of the node in the json, but we aren't using it because ...
* - ... we have nodeAutoColorBy set (to group, here).  If this is unset, it uses the color above
* - nodeOpacity is what it says
* - linkSource and linkTarget are the fields in the json for source and target. Again, just left them, probably won't change
* - linkColor and AutoColorBy and linkOpacity are same as node.	
* - linkWidth is 0, so it uses three "Lines".  Any integer above turns them into tubes, which look like garbage with these SpriteText nodes.
*   
*/
import {
    interactiveComponentTemplate,
    registerSharedAFRAMEComponents,
} from "../utils/interaction";
import { downloadBlob  } from "../utils/utils";
import SpriteText from 'three-spritetext';
import ThreeForceGraph from "three-forcegraph";

import {
    forceX as d3ForceX,
    forceY as d3ForceY,
    forceZ as d3ForceZ,
    forceLink as d3ForceLink,
    forceManyBody as d3ForceManyBody
} from 'd3-force-3d';

import {vueComponents as htmlComponents} from "https://resources.realitymedia.digital/vue-apps/dist/hubs.js";

///////////////////////////////////////////////////////////////////////////////
// simple convenience functions 
const parseJson = function (prop) {
    return (typeof prop === 'string')
        ? JSON.parse(prop)
        : prop; // already parsed
};

const parseFn = function (prop) {
    if (typeof prop === 'function') return prop; // already a function
    const geval = eval; // Avoid using eval directly https://github.com/rollup/rollup/wiki/Troubleshooting#avoiding-eval
    try {
        const evalled = geval('(' + prop + ')');
        return evalled;
    } catch (e) { } // Can't eval, not a function
    return null;
};

const parseAccessor = function (prop) {
    if (!isNaN(parseFloat(prop))) { return parseFloat(prop); } // parse numbers
    if (parseFn(prop)) { return parseFn(prop); } // parse functions
    return prop; // strings
};


function almostEqualVec3(u, v, epsilon) {
    return Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon;
};

// a lot of the complexity has been pulled out into methods in the object
// created by interactiveComponentTemplate() and registerSharedAFRAMEcomponents().
// Here, we define methods that are used by the object there, to do our object-specific
// work.

// We need to define:
// - AFRAME 
//   - schema
//   - init() method, which should can startInit() and finishInit()
//   - update() and play() if you need them
//   - tick() and tick2() to handle frame updates
//
// - change isNetworked, isInteractive, isDraggable (default: false) to reflect what 
//   the object needs to do.
// - loadData() is an async function that does any slow work (loading things, etc)
//   and is called by finishInit(), which waits till it's done before setting things up
// - initializeData() is called to set up the initial state of the object, a good 
//   place to create the 3D content.  The three.js scene should be added to 
//   this.simpleContainter
// - clicked() is called when the object is clicked
// - dragStart() is called right after clicked() if isDraggable is true, to set up
//   for a possible drag operation
// - dragEnd() is called when the mouse is released
// - drag() should be called each frame while the object is being dragged (between 
//   dragStart() and dragEnd())
// - getInteractors() returns an array of objects for which interaction controls are
//   intersecting the object. There will likely be zero, one, or two of these (if 
//   there are two controllers and both are pointing at the object).  The "cursor"
//   field is a pointer to the small sphere Object3D that is displayed where the 
//   interaction ray touches the object. The "controller" field is the 
///  corresponding controller
//   object that includes things like the rayCaster.
// - getIntersection() takes in the interactor and the three.js object3D array 
//   that should be tested for interaction.

// Note that only the entity that this component is attached to will be "seen"
// by Hubs interaction system, so the entire three.js tree below it triggers
// click and drag events.  The getIntersection() method is needed 

// the componentName must be lowercase, can have hyphens, start with a letter, 
// but no underscores
let componentName = "force-graph";

// get the template part of the object need for the AFRAME component
let template = interactiveComponentTemplate(componentName);

// create the additional parts of the object needed for the AFRAME component
let child = {
    schema: {
        // name is hopefully unique for each instance
        name: {
            type: "string",
            default: ""
        },

        // synchronize the state across all clients
        isNetworked: {
            type: "boolean",
            default: false
        },

        // static graph data or can be moved around
        isInteractive: {
            type: "boolean",
            default: true
        },

        // static graph data or can be moved around
        isDraggable: {
            type: "boolean",
            default: true
        },

        // if size is set, it will be used to scale the graph to that size
        height: {
            type: "number",
            default: 1
        },
        width: {
            type: "number",
            default: 1
        },

        vueApp: {
            type: "string",
            default: "GraphLabel"
        },

        textSize: {
            type: "number",
            default: "2"
        },

        jiggle: {
            type: "boolean",
            default: false
        },

        // from the original forcegraph-component
        jsonUrl: { type: 'string', default: '' },

        chargeForce: { type: 'number', default: 0 },
        xForce: { type: 'number', default: 0 },
        yForce: { type: 'number', default: 0 },
        zForce: { type: 'number', default: 0 },
        nodeId: { type: 'string', default: 'id' },
        nodeRelSize: { type: 'number', default: 4 }, // volume per val unit
        nodeVal: { parse: parseAccessor, default: 'val' },
        nodeColor: { parse: parseAccessor, default: 'color' },
        nodeAutoColorBy: { parse: parseAccessor, default: '' }, // color nodes with the same field equally
        nodeOpacity: { type: 'number', default: 0.75 },
        // leave these commented:  we might add a list of methods that could
        // be used to create the nodes.  But nothing right now.
        // nodeThreeObject: { parse: parseAccessor, default: null },
        linkSource: { type: 'string', default: 'source' },
        linkTarget: { type: 'string', default: 'target' },
        linkVisibility: { type: 'boolean', default: true },
        linkColor: { parse: parseAccessor, default: 'color' },
        linkAutoColorBy: { parse: parseAccessor, default: '' }, // color links with the same field equally
        linkOpacity: { type: 'number', default: 0.2 },
        linkWidth: { parse: parseAccessor, default: 0 }
    },

    // data.name is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {        
        // disable networking for now, until we figure out how to handle it
        // this.data.isNetworked = false;
        // this.data.jiggle = true;

        this.startInit();

        const state = this.state = {}; // Internal state
        this.initialRun = false;

        this.makeSpriteText = this.makeSpriteText.bind(this);
        this.makeHTMLText = this.makeHTMLText.bind(this);

        // setup FG object
        if (!this.forceGraph) {
            this.forceGraph = new ThreeForceGraph(); 
        }

        this.forceGraph.matrixAutoUpdate = true;
        this.useLevels = false;

        this.forceGraph
          .d3AlphaDecay(0.05)
          .cooldownTime(5000)
//          .d3AlphaMin(0.001)
          .onFinishUpdate(() => {
                if (!this.simpleContainer.getObject3D("forcegraphGroup")) {
                    this.simpleContainer.setObject3D('forcegraphGroup', this.forceGraph);
                }

                this.initialRun = true;
                this.forceGraph.onEngineStop(() => {
                    this.initialRun = false;
                    //this.scaleToFit();
                    this.el.sceneEl.emit('updatePortals');
                    if (this.data.jiggle) {
                        setTimeout(this.jiggle, Math.random() * 1000 + 100); // try again in 100 milliseconds
                    }
                })

                this.forceGraph.onEngineTick(() => {
                    // comment out:  we aren't going to rescale after the first
                    // layout is done, since it will be weird if a user drags and then
                    // it rescales when they let go
                    //this.initialRun = true;

                    // until we RECEIVE an update, we will keep the graph up to date.
                    // when there are multiple people, we only update on drag.
                    // if there are others in the room, we should have received an update by the 
                    // time we enter the room
                    if (this.el.sceneEl.is("entered")) {
                        if (document.querySelectorAll("[networked-avatar]").length  <= 1) {
                            if (this.sharedData.nodes.length != this.forceGraph.graphData().nodes.length) {
                                this.syncNodeData(this.forceGraph.graphData(), this.sharedData, true) ? this.setSharedData() : null;
                            } else {
                                this.testAndSetSharedData();
                            }
                        }
                    }
                });

                let graph = this.forceGraph.graphData();
                for (let i = 0; i < graph.nodes.length; i++) {
                    if (graph.nodes[i].level) {
                        this.useLevels = true;
                        break;
                    }
                }
                
                if (this.useLevels) {
                    for (let i = 0; i < graph.nodes.length; i++) {
                        let levels = [0, 0, 100, 200];

                        if (graph.nodes[i].level) {
                            let node = graph.nodes[i];

                            let scale = node[this.data.nodeVal] ? node[this.data.nodeVal] : 1;
                            let level = node.level ? levels[node.level] : 0;
    
                            if (level == levels[1]) {
                                level = level * 1 + Math.random() * 30;
                            }
                            node.yTarget =  this.data.nodeRelSize * level * scale;                        
                        }
                    }
    
                    //this.forceGraph.d3Force('charge').strength(-200);
                    // while (initialRun) {
                    //     this.forceGraph.tickFrame();
                    // }

                    // want to use these forces
                    // this.forceGraph.d3Force('x', d3ForceX());
                    // if (this.data.xForce !== 0) {
                    //     this.forceGraph.d3Force('x').strength(this.data.xForce);
                    // }

                    this.forceGraph.d3Force('y', d3ForceY()
                        .y(node => {
                            return node.yTarget ? node.yTarget : 1000
                        }).strength(node => {
                            return node.yTarget ? (this.data.yForce? this.data.yForce : 0.1) : 0;
                        })
                        // .strength(1)

                        //     //let dependedOn = this._nodeDependedOn(node);
    
                        //     // if (!dependedOn || node.dependsOn.length < 1) {
                        //     return 1;
                        //     // }
    
                        //     // not a top or bottom
                        //     // return 0;
                        // })
                    );
                        // if (this.data.yForce !== 0) {
                    //     this.forceGraph.d3Force('y').strength(this.data.yForce);
                    // }

                    // this.forceGraph.d3Force('z', d3ForceZ());
                    // if (this.data.zForce !== 0) {
                    //     this.forceGraph.d3Force('z').strength(this.data.zForce);
                    // }

                    // this.forceGraph.d3Force("link", d3ForceLink(graph.links)
                    //     .strength(link => {
                    //         if (link.source.level || link.target.level) {
                    //             let level = Math.max(link.source.level, link.target.level);
                    //             level = link.source.level ? level : link.target.level;
                    //             level = link.target.level ? level : link.source.level; 
                    //             return 1/level;
                    //         } else {
                    //             return 0.1;
                    //         }
                    //     })
                    //     .distance(link => {
                    //         if (link.source.level || link.target.level) {
                    //             let level = Math.max(link.source.level, link.target.level);
                    //             level = link.source.level ? level : link.target.level;
                    //             level = link.target.level ? level : link.source.level; 
                    //             return 30 * level;
                    //         } else {
                    //             return 30;
                    //         }
                    //     })
                    //     //.iterations(10)
                    // )
                 }
            })


        // override the defaults in the template
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;
        this.isDraggable = this.data.isDraggable;

        // some click/drag state;
        this.clickEvent = null;
        this.clickIntersection = null;
        
        // our shared object state. We don't need to share links, they don't change.  So
        // we'll just share the nodes. 
        this.sharedData = {
            nodes: [],
            updates: []
        };

        // finish the initialization
        this.finishInit();
    },

    // Utility methods
    getGraphBbox: function () {
        if (!this.forceGraph) {
            // Got here before component init -> initialize forceGraph
            this.forceGraph = new ThreeForceGraph();
        }

        return this.forceGraph.getGraphBbox();
    },

    d3Force: function () {
        if (!this.forceGraph) {
            // Got here before component init -> initialize forceGraph
            this.forceGraph = new ThreeForceGraph();
        }

        const forceGraph = this.forceGraph;
        const returnVal = forceGraph.d3Force.apply(forceGraph, arguments);

        return returnVal === forceGraph
            ? this // return self, not the inner forcegraph component
            : returnVal;
    },

    d3ReheatSimulation: function () {
        this.forceGraph && this.forceGraph.d3ReheatSimulation();
        return this;
    },

    refresh: function () {
        this.forceGraph && this.forceGraph.refresh();
        return this;
    },

    scaleToFit: function () {
        this.forceGraph.scale.set(1,1,1);
        this.forceGraph.updateMatrixWorld( true );

        let bbox = this.forceGraph.getGraphBbox();
        if (bbox) {
            let sizeH = bbox.y[1] - bbox.y[0] + 1;
            let sizeW = bbox.x[1] - bbox.x[0] + 1;
            sizeW = Math.max(sizeW, bbox.z[1] - bbox.z[0] + 1);

            if (sizeW > 0 && sizeH > 0) {
                sizeH = this.data.height / sizeH;
                sizeW = this.data.width / sizeW;

                // want both to fix their respective sizes, so we want
                // the scale to be the smaller of the two
                let scale = Math.min(sizeH, sizeW);
                //console.log("scale = ", scale, ", bbox = ", bbox)
                this.forceGraph.scale.set(scale, scale, scale);
                this.forceGraph.matrixNeedsUpdate = true;
                this.forceGraph.updateMatrixWorld( true );

            } else {
                console.log("scaleToFit size error, sizeW/H scale : ", sizeH, sizeW);
            }
        }
    },

    getGraphObj: function(object) {
        let obj = object;
        // recurse up object chain until finding the graph object
        while (obj && !obj.hasOwnProperty('__graphObjType')) {
          obj = obj.parent;
        }
        return obj;
    },
      
    makeSpriteText: function (node) {
        const sprite = new SpriteText(node.name);
        sprite.material.depthWrite = false; // make sprite background transparent
        sprite.color = node.color;
        sprite.textHeight = 8;
        return sprite;
    },

    htmlGenerator: null,
    makeHTMLText: function (node) {    
        let ret = new THREE.Object3D();

        let scale = 150;

        node._box = new THREE.Mesh(
            new THREE.BoxGeometry(2/scale, 2/scale, 2/scale, 2, 2, 2),
            new THREE.MeshBasicMaterial({
                color: node.color,
                opacity: this.data.nodeOpacity
            })
        );
        node._box.matrixAutoUpdate = true;
        ret.add(node._box);

        var titleScriptData = {
            text: node.name,
            color: node.color,
            size: this.data.textSize
        }

        let nodeSize = node[this.data.nodeVal] ? node[this.data.nodeVal]: 1;

        ret.scale.x = scale * this.data.nodeRelSize * nodeSize;
        ret.scale.y = scale * this.data.nodeRelSize * nodeSize;
        ret.scale.z = scale * this.data.nodeRelSize * nodeSize;
        ret.updateMatrix();

        // don't want to proceed until the cache is loaded
        //window.APP.scene.systems.portal.waitForCache().then(() => {
            node.htmlGenerator = htmlComponents["GraphLabel"](titleScriptData);
            //ret.add(this.htmlGenerator.webLayer3D);
            node.htmlGenerator.webLayer3D.matrixAutoUpdate = true;

            node.htmlGenerator.waitForReady().then(() => {    
                node.htmlGenerator.webLayer3D.contentMesh.material.opacity = this.data.nodeOpacity;  
                ret.add(node.htmlGenerator.webLayer3D);
                ret.remove(node._box);
                node._box = null;
            })
        //})
        return ret;

},

    // if anything changed in this.data, we need to update the object.  
    // this is probably not going to happen, but could if another of 
    // our scripts modifies the component properties in the DOM
    update: function (oldData) {
        const comp = this;
        const elData = this.data;
        const diff = AFRAME.utils.diff(elData, oldData);

        const fgProps = [
            'jsonUrl',
            'nodeId',
            'nodeVal',
            'nodeRelSize',
            'nodeColor',
            'nodeAutoColorBy',
            'nodeOpacity',
            'linkSource',
            'linkTarget',
            'linkVisibility',
            'linkColor',
            'linkAutoColorBy',
            'linkOpacity',
            'linkWidth',
        ];

        fgProps
            .filter(function (p) { return p in diff; })
            .forEach(function (p) {
                if (p === "jsonUrl") {
                    elData[p] = "https://resources.realitymedia.digital/data/forcegraph/" + elData[p];
                }

                comp.forceGraph[p](elData[p] !== '' ? elData[p] : null);
            }); // Convert blank values into nulls

        this.forceGraph.nodeThreeObject(this.makeHTMLText);

        if (this.data.chargeForce != 0) {
            this.forceGraph.d3Force('charge').strength(this.data.chargeForce);

            // this.forceGraph.d3Force('charge', d3ForceManyBody());//.strength(-0.01*this.data.chargeForce));
        }
    },

    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
    },
        
    // called by initTemplate() when the component is being processed.  Here, we create
    // the three.js objects we want, and add them to simpleContainer (an AFrame node 
    // the template created for us).
    initializeData: function () {
    },

    // called from remove() in the template to remove any local resources when the component
    // is destroyed
    remove: function () {
        this.simpleContainer.removeObject3D('forcegraphGroup');
        this.removeTemplate();
    },

    jiggle: function () {
        if (this.handleInteraction.isDragging) return

        let graph = this.forceGraph.graphData()
        let n = Math.round(Math.random() * (graph.nodes.length-1))

        if (this.forceGraph.d3Force('charge').strength() > this.data.chargeForce) {
            this.forceGraph.d3Force('charge').strength(this.data.chargeForce*0.9)
        } else {
            this.forceGraph.d3Force('charge').strength(this.data.chargeForce*1.1);
        }

        // let node = graph.nodes[n]
        // node.vx = Math.random()*0.25 - 0.5
        // node.vy = Math.random()*0.25 - 0.5
        // node.vz = Math.random()*0.25 - 0.5
        
        this.forceGraph.resetCountdown();  // prevent freeze while dragging
    },
    
    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        let ns = this.forceGraph.graphData();
        let targets = [];
        ns.nodes.forEach((node) => {
            // might not be created yet
            if (node.__threeObj && node.__threeObj.__graphObjType == 'node') {
                targets.push(node.__threeObj)
            }
        })

        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, targets);//[evt.target]);

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        let node = this.getGraphObj(this.clickIntersection.object)
        if (node.__graphObjType != 'node') {
            this.clickIntersection = null;
            return;
        }

        this.clickNode = node.__data;
        this.clickEvent = evt;

        // if we aren't dragging, may want to do something with a click
        if (!this.handleInteraction.isDragging) {
            // perhaps add a random force to the clicked node?
        }

        window.APP.scene.systems["data-logging"].logForcegraph(this.el.object3D.name, this.clickNode.name);

    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // clicked on something that wasn't a node, like a link
        if (!this.clickIntersection) {
            return;
        }

        // set up the drag state
        if (!this.handleInteraction.startDrag(evt, this.clickNode.__threeObj, this.clickIntersection)) {
            return;
        }

        // the initial positions of the draggable object node
        let node = this.clickNode;
        this.initialFixedPos = {fx: node.fx, fy: node.fy, fz: node.fz};
 
        this.initialPos = new THREE.Vector3(node.x, node.y, node.z);

        // console.log("dragStart:  initialPos: ", this.initialPos);
        // console.log("dragStart:  initialWorld: ", this.handleInteraction.initialIntersectionPoint);

        this.clickNodeSpace = node.__threeObj.parent.worldToLocal(this.handleInteraction.initialIntersectionPoint.clone());
        // console.log("dragStart:  clickNodeSpace: ", this.clickNodeSpace);
        let offset = this.clickNodeSpace.sub(this.initialPos);
        
        // console.log("dragStart:  offset: ", offset);
        offset.applyQuaternion(node.__threeObj.quaternion.clone().invert());
        // console.log("dragStart:  offset: ", offset);
        
        this.clickNodeSpaceOffset = offset;

        // lock node
        ['x', 'y', 'z'].forEach(c => node[`f${c}`] = node[c]);
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        // clicked on something that wasn't a node, like a link
        if (!this.clickIntersection) {
            return
        }

        this.handleInteraction.endDrag(evt)

        let node = this.clickNode;
        // node.yTarget = node.y;

        const initFixedPos = this.initialFixedPos;
        const initPos = this.initialPos;
        if (initFixedPos) {
            let finalPos = new THREE.Vector3(node.x, node.y, node.z).applyMatrix4(node.__threeObj.parent.matrixWorld);
            this.initialPos.applyMatrix4(node.__threeObj.parent.matrixWorld);
            let dist = finalPos.distanceTo(this.initialPos);

            if (dist < 0.05) {
                ['x', 'y', 'z'].forEach(c => {
                    const fc = `f${c}`;
                    delete(node[fc]);
                });
            }
            // ['x', 'y', 'z'].forEach(c => {
            //     const fc = `f${c}`;
            //     if (initFixedPos[fc] === undefined) {
            //         delete(node[fc]);
            //     // } else {
            //     //     node[fc] = initFixedPos[fc];
            //     }
            // });
            delete(this.initialFixedPos);
            delete(this.initialPos);
            delete[this.clickNodeSpaceOffset];
            delete[this.clickNodeSpace];
        }
        this.sendSharedNode(this.clickNode);

        // this.forceGraph.d3Force('y').initialize(this.forceGraph.graphData().nodes)
        this.forceGraph
          .d3AlphaTarget(0)   // release engine low intensity
          .resetCountdown();  // let the engine readjust after releasing fixed nodes
    },

    // the method setSharedData() always sets the shared data, causing a network update.  
    // We can be smarter here by calling it only when significant changes happen, 
    // which we'll do in the setSharedEuler methods
    // setSharedEuler: function (newEuler) {
    //     if (!almostEqualVec3(this.sharedData.rotation, newEuler, 0.05)) {
    //         this.sharedData.rotation.copy(newEuler)
    //         this.setSharedData()
    //     }
    // },
    // setSharedPosition: function (newPos) {
    //     if (!almostEqualVec3(this.sharedData.position, newPos, 0.05)) {
    //         this.sharedData.position.copy(newPos)
    //         this.setSharedData()
    //     }
    // },

    almostEqualNode(u, v, epsilon) {
        if (!u && !v) return true;
        if ((!u && v) || (!v && u)) return false; 
        return  u.color === v.color && 
                Math.abs(u.x - v.x) < epsilon && Math.abs(u.y - v.y) < epsilon && Math.abs(u.z - v.z) < epsilon &&
                ((!u.fx && !v.fx) || (u.fx && v.fx && Math.abs(u.fx - v.fx) < epsilon)) && 
                ((!u.fy && !v.fy) || (u.fy && v.fy && Math.abs(u.fy - v.fy) < epsilon)) &&
                ((!u.fz && !v.fz) || (u.fz && v.fz && Math.abs(u.fz - v.fz) < epsilon)) &&
                ((!u.vx && !v.vx) || (u.vx && v.vx && Math.abs(u.vx - v.vx) < epsilon)) &&
                ((!u.vy && !v.vy) || (u.vy && v.vy && Math.abs(u.vy - v.vy) < epsilon)) &&
                ((!u.vz && !v.vz) || (u.vz && v.vz && Math.abs(u.vz - v.vz) < epsilon));
    },
    
    sendSharedNode(node) {
        let graph = this.forceGraph.graphData();
        for (let i = 0; i < graph.nodes.length; i++) {
            if (graph.nodes[i] == node && !this.almostEqualNode(this.sharedData.nodes[i], node, 0.5)) {
                this.syncNodeData(graph, this.sharedData) 
                for (let j=0; j<this.sharedData.nodes.length; j++) {
                    this.sharedData.updates[j] = false;
                }
                this.sharedData.updates[i] = true;
                this.setSharedData();
            }
        }
    },

    copyNode(node, destNode) {
        let changed = false;
        !node.color || destNode.color == node.color ? null : (destNode.color = node.color, changed = true);            
        [/*"vx", "vy", "vz",*/ "x", "y", "z", "fx", "fy", "fz"].forEach(c => {
            if (node[c]) {
                destNode[c] = node[c];
                changed = true;
            } 
            else if (destNode[c]) {
                delete(destNode[c]);
                changed = true;
            }
        });

        // if (fixed) {
        //     ["fx", "fy", "fz"].forEach(c => {
        //         if (node[c]) {
        //             destNode[c] = node[c];
        //             changed = true;
        //         } 
        //         // else if (destNode[c]) {
        //         //     delete(destNode[c]);
        //         //     changed = true;
        //         // }
        //     });
        // }
        return changed
    },

    syncNodeData: function (src, dest) {
        // if updates exists, we are copying to sharedData, otherwise we are copying from sharedData
        let syncOut = dest.updates; 

        let changed = false;
        for (let i = 0; i< src.nodes.length; i++) {
            let node = src.nodes[i];
            if (dest.nodes.length <= i) {
                dest.nodes.push({});
                changed = true;
            }
            let destNode = dest.nodes[i];
            if (syncOut) {
                this.sharedData.updates[i] = this.copyNode(node, destNode)
                changed = this.sharedData.updates[i] | changed;
            } else {
                if (src.updates[i] && this.copyNode(node, destNode)) {
                    changed = true;
                }
            }
        }     
        return changed           
    },

    testAndSetSharedData: function () {
        let graph = this.forceGraph.graphData();
        let changed = false;
        for (let i = 0; i< graph.nodes.length; i++) {
            let node = graph.nodes[i];
            let destNode = this.sharedData.nodes[i];
            if (!this.almostEqualNode(destNode, node, 0.5)) {
                changed = true;
                break;
            }
        }
        if (changed) {
            this.syncNodeData(this.forceGraph.graphData(), this.sharedData)? this.setSharedData() : null;
        }
    },

    updateCount: 0,

    hasFixed: function(node) {
        return node["fx"] != undefined // || node["fy"] || node["fz"]
    },

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        let sharedDataToSend = {nodes: []};
        if (this.stateSync) {
            //console.log("setSharedData: ", this.updateCount++);
            for (let i = 0; i< this.sharedData.nodes.length; i++) {
                if (this.sharedData.updates[i]){ // || this.hasFixed(this.sharedData.nodes[i])) {
                    sharedDataToSend.nodes[i] = this.sharedData.nodes[i];
                    // this.sharedData.updates[i] = true;
                } else {
                    sharedDataToSend.nodes[i] = {}
                }
            }
            sharedDataToSend.updates = this.sharedData.updates;
            return this.stateSync.setSharedData(sharedDataToSend);
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    cameraMatrix: new THREE.Matrix4(),
    cameraQuaternion: new THREE.Quaternion(),
    nodeQuaternion: new THREE.Quaternion(),
    _m1: new THREE.Matrix4(),

    mat: new THREE.Matrix4(),
    eye: new THREE.Vector3(),
    center: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),

    decayCount: 0,
    tick: function (time) {
        const state = this.state;
        const props = this.data;

        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use deltaVector
                // to move the node around. These values are set as a relative offset in
                // the plane perpendicular to the view.
                // update drag state
                this.handleInteraction.drag();

                // clicked on something that wasn't a node, like a link
                if (!this.clickIntersection) {
                    return;
                }
                let node = this.clickNode;
                //console.log("drag: newWorldPos: ", this.handleInteraction.intersectionPoint);

                let newPos = node.__threeObj.parent.worldToLocal(this.handleInteraction.intersectionPoint.clone());
                // console.log("    : newPos: ", newPos);
                let offset = this.clickNodeSpaceOffset.clone().applyQuaternion(node.__threeObj.quaternion);
                // console.log("    :  offset: ", offset);
        
                newPos.sub(offset);
                // console.log("    : new graph position: ", newPos);

                // Move fx/fy/fz (and x/y/z) of nodes based on object new position
                ['x', 'y', 'z'].forEach(c => node[`f${c}`] = node[c] = newPos[c]);

                this.sendSharedNode(node);

                this.forceGraph
                    .d3AlphaTarget(0.3) // keep engine initialRun at low intensity throughout drag
                    .resetCountdown();  // prevent freeze while dragging
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                //let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
               // let setIt = false;

                // for each of our interactors, check if it hits the scene
                // for (let i = 0; i < passthruInteractor.length; i++) {
                //     let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children)

                    // // if we hit the small box, set the color to yellow, and flag that we hit
                    // if (intersection && intersection.object === this.box2) {
                    //     this.box2.material.color.set("yellow")
                    //     setIt = true
                    // }
                // }

                // if we didn't hit, make sure the color remains black
                // if (!setIt) {
                //     this.box2.material.color.set("black")
                // }
            }
        }

        if (this.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) {
                return
            }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false;

                // got the data, now do something with it
                let newData = this.stateSync.dataObject;

                if (this.syncNodeData(newData, this.forceGraph.graphData())) {
                    this.forceGraph
                     .d3AlphaTarget(0.3)   // release engine low intensity
                     .resetCountdown();  // let the engine readjust after receiving data                          
                    //.d3ReheatSimulation();
                    this.decayCount = 60;
                }
            }
            if (this.decayCount > 0) {
                this.decayCount--;
                if (this.decayCount == 0) {
                    this.forceGraph.d3AlphaTarget(0);
                    // let graph = this.forceGraph.graphData();
                    // for (let i = 0; i< graph.nodes.length; i++) {
                    //     if (!this.handleInteraction.isDragging || this.clickNode !== graph.nodes[i]) {
                    //         ['x', 'y', 'z'].forEach(c => {
                    //             const fc = `f${c}`;
                    //             delete(graph.nodes[i][fc]);
                    //         });
                    //     }
                    // }
                }
            }
        }

        // Run force-graph ticker
        //const isD3Sim = this.forceGraph.forceEngine !== 'ngraph';
        let foo = this.forceGraph.__kapsuleInstance.forceEngine()

        if (foo == "d3") {
            this.forceGraph.tickFrame();
            let ns = this.forceGraph.graphData();
            
            // need to force this or we'll get the one from last frame
            // which will cause the graph to swim when the head moves
            this.el.sceneEl.camera.updateMatrices();
            this.el.sceneEl.camera.getWorldQuaternion(this.cameraQuaternion);

            // this.el.sceneEl.camera.getWorldPosition(this.eye);
            // this.forceGraph.getWorldPosition(this.center);
            // this.mat.lookAt(this.eye, this.center, this.up);
            // this.cameraQuaternion.setFromRotationMatrix(this.mat);

            this.forceGraph.getWorldQuaternion(this.nodeQuaternion).invert().multiply(this.cameraQuaternion);

            ns.nodes.forEach((node) => {
                // might not be created yet
                node.__threeObj && node.__threeObj.quaternion.copy( this.nodeQuaternion );

                if (node._box) {
                    node._box.rotation.z += 0.03;
                    //node._box.matrixNeedsUpdate = true;
                }

                node.htmlGenerator && node.htmlGenerator.tick(time)

                // if node.__threeObj isn't created, or it is and box hasn't yet been removed,
                // we will tick
            // if ((node._box || !node.__threeObj) && node.htmlGenerator) {
                //   node.htmlGenerator.tick(time);
            // }  
            }) 
            if (!(this.isInteractive && this.isDraggable && this.handleInteraction.isDragging)  && this.initialRun) {
                this.scaleToFit();
            }

            this.forceGraph.traverseVisible(function (node) {
                node.matrixNeedsUpdate = true;
            })
        } else {
            console.warn("forcegraph is " + foo)
        }

    },

    // get the list of state hashes for all nodes
    getCacheSet: function () {
        let graph = this.forceGraph.graphData();
        const states = new Set()
        for (let i = 0; i < graph.nodes.length; i++) {
            let layer = graph.nodes[i].htmlGenerator.webLayer3D
            layer.traverseLayersPreOrder((inner) => {
                for (const hash of inner.allStateHashes) states.add(hash)
            })
        }
        return states
        //await htmlComponents["exportCache"](this.data.jsonUrl, Array.from(states))
    },

    // loadCache: async function () {
    //     await htmlComponents["loadCache"]("https://resources.realitymedia.digital/data/forcegraph/cache/" + this.data.jsonUrl + ".cache")
    // }
}

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
})

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName);