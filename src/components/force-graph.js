/**
 * Description
 * ===========
 * create a forcegraph component (using https://github.com/vasturiano/three-forcegraph)
 * that can be interacted with and has some networked attributes.
 *
 */
import {
    interactiveComponentTemplate,
    registerSharedAFRAMEComponents,
} from "../utils/interaction";

import ThreeForceGraph from "three-forcegraph";

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
} catch (e) {} // Can't eval, not a function
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

// function generateTextNode(node) {
//     const sprite = new SpriteText(node.id);
//     sprite.material.depthWrite = false; 
//     sprite.color = node.color;
//     sprite.textHeight = 8;
//     return sprite;
// }
  
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
        size: {
            type: "number",
            default: 0
        },

        // from the original forcegraph-component
        jsonUrl: { type: 'string', default: '' },
        nodes: { parse: parseJson, default: [] },
        links: { parse: parseJson, default: [] },
        numDimensions: { type: 'number', default: 3 },
        dagMode: { type: 'string', default: '' },
        dagLevelDistance: { type: 'number', default: 0 },
        dagNodeFilter: { parse: parseFn, function() { return true; }},
        onDagError: { parse: parseFn, default: undefined },
        nodeRelSize: { type: 'number', default: 4 }, // volume per val unit
        nodeId: { type: 'string', default: 'id' },
        nodeVal: { parse: parseAccessor, default: 'val' },
        nodeResolution: { type: 'number', default: 8 }, // how many slice segments in the sphere's circumference
        nodeVisibility: { parse: parseAccessor, default: true },
        nodeColor: { parse: parseAccessor, default: 'color' },
        nodeAutoColorBy: { parse: parseAccessor, default: '' }, // color nodes with the same field equally
        nodeOpacity: { type: 'number', default: 0.75 },
        nodeThreeObject: { parse: parseAccessor, default: null },
        nodeThreeObjectExtend: { parse: parseAccessor, default: false },
        linkSource: { type: 'string', default: 'source' },
        linkTarget: { type: 'string', default: 'target' },
        linkVisibility: { parse: parseAccessor, default: true },
        linkColor: { parse: parseAccessor, default: 'color' },
        linkAutoColorBy: { parse: parseAccessor, default: '' }, // color links with the same field equally
        linkOpacity: { type: 'number', default: 0.2 },
        linkWidth: { parse: parseAccessor, default: 0 },
        linkResolution: { type: 'number', default: 6 }, // how many radial segments in each line cylinder's geometry
        linkCurvature: { parse: parseAccessor, default: 0 },
        linkCurveRotation: { parse: parseAccessor, default: 0 },
        linkMaterial: { parse: parseAccessor, default: null },
        linkThreeObject: { parse: parseAccessor, default: null },
        linkThreeObjectExtend: { parse: parseAccessor, default: false },
        linkPositionUpdate: { parse: parseFn, default: null },
        linkDirectionalArrowLength: { parse: parseAccessor, default: 0 },
        linkDirectionalArrowColor: { parse: parseAccessor, default: null },
        linkDirectionalArrowRelPos: { parse: parseAccessor, default: 0.5 }, // value between 0<>1 indicating the relative pos along the (exposed) line
        linkDirectionalArrowResolution: { type: 'number', default: 8 }, // how many slice segments in the arrow's conic circumference
        linkDirectionalParticles: { parse: parseAccessor, default: 0 }, // animate photons travelling in the link direction
        linkDirectionalParticleSpeed: { parse: parseAccessor, default: 0.01 }, // in link length ratio per frame
        linkDirectionalParticleWidth: { parse: parseAccessor, default: 0.5 },
        linkDirectionalParticleColor: { parse: parseAccessor, default: null },
        linkDirectionalParticleResolution: { type: 'number', default: 4 }, // how many slice segments in the particle sphere's circumference
        onNodeHover: { parse: parseFn, default: () => {} },
        onLinkHover: { parse: parseFn, default: () => {} },
        onNodeClick: { parse: parseFn, default: () => {} },
        onLinkClick: { parse: parseFn, default: () => {} },
        forceEngine: { type: 'string', default: 'd3' }, // 'd3' or 'ngraph'
        d3AlphaMin: { type: 'number', default: 0 },
        d3AlphaDecay: { type: 'number', default: 0.0228 },
        d3VelocityDecay: { type: 'number', default: 0.4 },
        ngraphPhysics: { parse: parseJson, default: null },
        warmupTicks: { type: 'int', default: 0 }, // how many times to tick the force engine at init before starting to render
        cooldownTicks: { type: 'int', default: 1e18 }, // Simulate infinity (int parser doesn't accept Infinity object)
        cooldownTime: { type: 'int', default: 15000 }, // ms
        onEngineTick: { parse: parseFn, default: function () {} },
        onEngineStop: { parse: parseFn, default: function () {} }
    },
  
  // Bind component methods
  getGraphBbox: function() {
    if (!this.forceGraph) {
      // Got here before component init -> initialize forceGraph
      this.forceGraph = new ThreeForceGraph();
    }

    return this.forceGraph.getGraphBbox();
  },
  emitParticle: function () {
    if (!this.forceGraph) {
      // Got here before component init -> initialize forceGraph
      this.forceGraph = new ThreeForceGraph();
    }

    const forceGraph = this.forceGraph;
    const returnVal = forceGraph.emitParticle.apply(forceGraph, arguments);

    return returnVal === forceGraph
      ? this // return self, not the inner forcegraph component
      : returnVal;
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


    // fullName is used to generate names for the AFRame objects we create.  Should be
    // unique for each instance of an object, which we specify with name.  If name does
    // name get used as a scheme parameter, it defaults to the name of it's parent glTF
    // object, which only works if those are uniquely named.
    init: function () {
        this.startInit();

        const state = this.state = {}; // Internal state

        // setup FG object
        if (!this.forceGraph) this.forceGraph = new ThreeForceGraph(); // initialize forceGraph if it doesn't exist yet
        this.forceGraph
            .onFinishUpdate(() => this.simpleContainer.setObject3D('forcegraphGroup', this.forceGraph)) // Bind forcegraph to elem
            //.onLoading(() => state.infoEl.setAttribute('value', 'Loading...')) // Add loading msg
            .onFinishLoading(() => this.el.sceneEl.emit('updatePortals')) // Update portals



        // the template uses these to set things up.  relativeSize
        // is used to set the size of the object relative to the size of the image
        // that it's attached to: a size of 1 means 
        //   "the size of 1x1x1 units in the object
        //    space will be the same as the size of the image".  
        // Larger relative sizes will make the object smaller because we are
        // saying that a size of NxNxN maps to the Size of the image, and vice versa.  
        // For example, if the object below is 2,2 in size and we set size 2, then
        // the object will remain the same size as the image. If we leave it at 1,1,
        // then the object will be twice the size of the image. 
        this.relativeSize = this.data.size;

        // override the defaults in the template
        this.isInteractive = this.data.isInteractive;
        this.isNetworked = this.data.isNetworked;

        // our potentiall-shared object state (two roations and two colors for the boxes) 
        this.sharedData = {
        };

        // some click/drag state
        this.clickEvent = null
        this.clickIntersection = null

        // we should set fullName if we have a meaningful name
        if (this.data.name && this.data.name.length > 0) {
            this.fullName = this.data.name;
        }

        // finish the initialization
        this.finishInit();
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
          'numDimensions',
          'dagMode',
          'dagLevelDistance',
          'dagNodeFilter',
          'onDagError',
          'nodeRelSize',
          'nodeId',
          'nodeVal',
          'nodeResolution',
          'nodeVisibility',
          'nodeColor',
          'nodeAutoColorBy',
          'nodeOpacity',
          'nodeThreeObject',
          'nodeThreeObjectExtend',
          'linkSource',
          'linkTarget',
          'linkVisibility',
          'linkColor',
          'linkAutoColorBy',
          'linkOpacity',
          'linkWidth',
          'linkResolution',
          'linkCurvature',
          'linkCurveRotation',
          'linkMaterial',
          'linkThreeObject',
          'linkThreeObjectExtend',
          'linkPositionUpdate',
          'linkDirectionalArrowLength',
          'linkDirectionalArrowColor',
          'linkDirectionalArrowRelPos',
          'linkDirectionalArrowResolution',
          'linkDirectionalParticles',
          'linkDirectionalParticleSpeed',
          'linkDirectionalParticleWidth',
          'linkDirectionalParticleColor',
          'linkDirectionalParticleResolution',
          'forceEngine',
          'd3AlphaMin',
          'd3AphaDecay',
          'd3VelocityDecay',
          'ngraphPhysics',
          'warmupTicks',
          'cooldownTicks',
          'cooldownTime',
          'onEngineTick',
          'onEngineStop'
        ];
    
        fgProps
          .filter(function (p) { return p in diff; })
          .forEach(function (p) { 
              if (p === "jsonUrl") {
                  elData[p] = "https://resources.realitymedia.digital/data/forcegraph/" + elData[p];
              }
              
              comp.forceGraph[p](elData[p] !== '' ? elData[p] : null); }); // Convert blank values into nulls
    
        if ('nodes' in diff || 'links' in diff) {
          comp.forceGraph.graphData({
            nodes: elData.nodes,
            links: elData.links
          });
        }
    },
    
    // do some stuff to get async data.  Called by initTemplate()
    loadData: async function () {
        return
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
        this.removeTemplate()
    },

    // handle "interact" events for clickable entities
    clicked: function (evt) {
        // the evt.target will point at the object3D in this entity.  We can use
        // handleInteraction.getInteractionTarget() to get the more precise 
        // hit information about which object3Ds in our object were hit.  We store
        // the one that was clicked here, so we know which it was as we drag around
        this.clickIntersection = this.handleInteraction.getIntersection(evt.object3D, [evt.target]);
        this.clickEvent = evt;

        if (!this.clickIntersection) {
            console.warn("click didn't hit anything; shouldn't happen");
            return;
        }

        // this.clickIntersection.object 
        // this.state.hoverObj && this.data['on' + (this.state.hoverObj.__graphObjType === 'node' ? 'Node' : 'Link') + 'Click'](this.state.hoverObj.__data)
    },

    // called to start the drag.  Will be called after clicked() if isDraggable is true
    dragStart: function (evt) {
        // set up the drag state
        if (!this.handleInteraction.startDrag(evt)) {
            return
        }

        // // grab a copy of the current orientation of the object we clicked
        // if (this.clickIntersection.object == this.box) {
        //     this.initialEuler.copy(this.box.rotation)
        // } else if (this.clickIntersection.object == this.box2) {
        //     this.box2.material.color.set("red")
        // }
    },

    // called when the button is released to finish the drag
    dragEnd: function (evt) {
        this.handleInteraction.endDrag(evt)
        // if (this.clickIntersection.object == this.box) {} else if (this.clickIntersection.object == this.box2) {
        //     this.box2.material.color.set("black")
        // }
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

    // if the object is networked, this.stateSync will exist and should be called
    setSharedData: function () {
        if (this.stateSync) {
            return this.stateSync.setSharedData(this.sharedData)
        }
        return true
    },

    // this is called from the networked data entity to get the initial data 
    // from the component
    getSharedData: function () {
        return this.sharedData
    },

    // per frame stuff
    tick: function (time) {
        const state = this.state;
        const props = this.data;
    
        // if it's interactive, we'll handle drag and hover events
        if (this.isInteractive) {

            // if we're dragging, update the rotation
            if (this.isDraggable && this.handleInteraction.isDragging) {

                // do something with the dragging. Here, we'll use delta.x and delta.y
                // to rotate the object.  These values are set as a relative offset in
                // the plane perpendicular to the view, so we'll use them to offset the
                // x and y rotation of the object.  This is a TERRIBLE way to do rotate,
                // but it's a simple example.
                // if (this.clickIntersection.object == this.box) {
                //     // update drag state
                //     this.handleInteraction.drag()

                //     // compute a new rotation based on the delta
                //     this.box.rotation.set(this.initialEuler.x - this.handleInteraction.delta.x,
                //         this.initialEuler.y + this.handleInteraction.delta.y,
                //         this.initialEuler.z)

                //     // update the shared rotation
                //     this.setSharedEuler(this.box.rotation)
                // } else if (this.clickIntersection.object == this.box2) {

                    // we want to hit test on our boxes, but only want to know if/where
                    // we hit the big box.  So first hide the small box, and then do a
                    // a hit test, which can only result in a hit on the big box.  
                    // this.box2.visible = false
                    // let intersect = this.handleInteraction.getIntersection(this.handleInteraction.dragInteractor, [this.box])
                    // this.box2.visible = true

                    // // if we hit the big box, move the small box to the position of the hit
                    // if (intersect) {
                    //     // the intersect object is a THREE.Intersection object, which has the hit point
                    //     // specified in world coordinates.  So we move those coordinates into the local
                    //     // coordiates of the big box, and then set the position of the small box to that
                    //     let position = this.box.worldToLocal(intersect.point)
                    //     this.box2.position.copy(position)
                    //     this.setSharedPosition(this.box2.position)
                    // }
                // }
            } else {
                // do something with the rays when not dragging or clicking.
                // For example, we could display some additional content when hovering
                let passthruInteractor = this.handleInteraction.getInteractors(this.simpleContainer);

                // we will set yellow if either interactor hits the box. We'll keep track of if
                // one does
                let setIt = false;

                // for each of our interactors, check if it hits the scene
                for (let i = 0; i < passthruInteractor.length; i++) {
                    let intersection = this.handleInteraction.getIntersection(passthruInteractor[i], this.simpleContainer.object3D.children)

                    // // if we hit the small box, set the color to yellow, and flag that we hit
                    // if (intersection && intersection.object === this.box2) {
                    //     this.box2.material.color.set("yellow")
                    //     setIt = true
                    // }
                }

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
                this.stateSync.changed = false

                // got the data, now do something with it
                let newData = this.stateSync.dataObject
                // this.sharedData.color.set(newData.color)
                // this.sharedData.rotation.copy(newData.rotation)
                // this.sharedData.position.copy(newData.position)
                // this.box.material.color.set(newData.color)
                // this.box.rotation.copy(newData.rotation)
                // this.box2.position.copy(newData.position)
            }
        }
        // Run force-graph ticker
        this.forceGraph.tickFrame();
    }
}

// register the component with the AFrame scene
AFRAME.registerComponent(componentName, {
    ...child,
    ...template
})

// create and register the data component and it's NAF component with the AFrame scene
registerSharedAFRAMEComponents(componentName)