/**
 * Description
 * ===========
 * create a text object by rendering HTML
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

//import {WebLayer3D, toDOM, THREE} from '/node_modules/ethereal/dist/ethereal.es.js'

// const errorHTML = '<div id="hello" xr-width="2" style="width: 200px; height: 30px; background: rgba(1, 0, 0, 0.6); position:absolute">No Text Provided</div>'

import * as htmlComponents from "https://resources.realitymedia.digital/test-vue-app/dist/hubs.min.js";

AFRAME.registerComponent('html-script', {
    schema: {
        // name must follow the pattern "*_componentName"
        name: { type: "string", default: ""}
    },
    init: function () {
        this.script = null;
        this.fullName = this.data.name;
        this.parseNodeName();
        this.createScript();
    },

    update: function () {
        if (this.data.name === "" || this.data.name === this.fullName) return

        this.fullName = this.data.name;
        this.parseNodeName();

        if (this.script) {
            this.destroyScript()
        }
        this.createScript();
    },

    createScript: function () {
        // each time we load a script component we will possibly create
        // a new networked component.  This is fine, since the networked Id 
        // is based on the full name passed as a parameter, or assigned to the
        // component in Spoke.  It does mean that if we have
        // multiple objects in the scene which have the same name, they will
        // be in sync.  It also means that if you want to drop a component on
        // the scene via a .glb, it must have a valid name parameter inside it.
        // A .glb in spoke will fall back to the spoke name if you use one without
        // a name inside it.
        this.loadScript().then( () => {
            if (!this.script) return

            if (this.script.isNetworked) {
                // get the parent networked entity, when it's finished initializing.  
                // When creating this as part of a GLTF load, the 
                // parent a few steps up will be networked.  We'll only do this
                // if the HTML script wants to be networked
                this.netEntity = null

                // bind callbacks
                this.getSharedData = this.getSharedData.bind(this);
                this.takeOwnership = this.takeOwnership.bind(this);
                this.setSharedData = this.setSharedData.bind(this)

                this.script.setNetworkMethods(this.takeOwnership, this.setSharedData)
            }

            // set up the local content and hook it to the threejs scene
            this.simpleContainer = new THREE.Object3D()
            this.simpleContainer.matrixAutoUpdate = true
            this.simpleContainer.add(this.script.webLayer3D)
            // this.script.webLayer3D._webLayer._hashingCanvas.width = 20
            // this.script.webLayer3D._webLayer._hashingCanvas.height = 20

            // lets figure out the scale, but scaling to fill the a 1x1m square, that has also
            // potentially been scaled by the parents parent node. If we scale the entity in spoke,
            // this is where the scale is set.  If we drop a node in and scale it, the scale is also
            // set there.
            // We used to have a fixed size passed back from the entity, but that's too restrictive:
            // const width = this.script.width
            // const height = this.script.height

            var parent2 = this.el.parentEl.parentEl.object3D
            var width = parent2.scale.x
            var height = parent2.scale.y
            parent2.scale.x = 1
            parent2.scale.y = 1

            if (width && width > 0 && height && height > 0) {
                var bbox = new THREE.Box3().setFromObject(this.script.webLayer3D);
                var wsize = bbox.max.x - bbox.min.x
                var hsize = bbox.max.y - bbox.min.y
                var scale = Math.max(width / wsize, height / hsize)
                this.simpleContainer.scale.set(scale,scale,scale)
            }

            this.el.object3D.add(this.simpleContainer)
            setInterval(() => {
                // update on a regular basis
                this.script.webLayer3D.refresh(true)
                this.script.webLayer3D.update(true)
            }, 50)

            if (this.script.isInteractive) {
                // make the html object clickable
                this.el.setAttribute('is-remote-hover-target','')
                this.el.setAttribute('tags', {singleActionButton: true})
                this.el.classList.add("interactable")
                
                // forward the 'interact' events to our object 
                this.clicked = this.clicked.bind(this)
                this.el.object3D.addEventListener('interact', this.clicked)

                this.raycaster = new THREE.Raycaster()
                this.hoverRayL = new THREE.Ray()
                this.hoverRayR = new THREE.Ray()
            }
            if (this.script.isNetworked) {
                // This function finds an existing copy of the Networked Entity (if we are not the
                // first client in the room it will exist in other clients and be created by NAF)
                // or create an entity if we are first.
                this.setupNetworkedEntity = function (networkedEl) {
                    var persistent = true;
                    var netId;
                    if (networkedEl) {
                        // We will be part of a Networked GLTF if the GLTF was dropped on the scene
                        // or pinned and loaded when we enter the room.  Use the networked parents
                        // networkId plus a disambiguating bit of text to create a unique Id.
                        netId = NAF.utils.getNetworkId(networkedEl) + "-html-script";

                        // if we need to create an entity, use the same persistence as our
                        // network entity (true if pinned, false if not)
                        persistent = entity.components.networked.data.persistent;
                    } else {
                        // this only happens if this component is on a scene file, since the
                        // elements on the scene aren't networked.  So let's assume each entity in the
                        // scene will have a unique name.  Adding a bit of text so we can find it
                        // in the DOM when debugging.
                        netId = this.fullName.replaceAll("_","-") + "-html-script"
                    }

                    // check if the networked entity we create for this component already exists. 
                    // otherwise, create it
                    // - NOTE: it is created on the scene, not as a child of this entity, because
                    //   NAF creates remote entities in the scene.
                    var entity;
                    if (NAF.entities.hasEntity(netId)) {
                        entity = NAF.entities.getEntity(netId);
                    } else {
                        entity = document.createElement('a-entity')

                        // store the method to retrieve the script data on this entity
                        entity.getSharedData = this.getSharedData;

                        // the "networked" component should have persistent=true, the template and 
                        // networkId set, owner set to "scene" (so that it doesn't update the rest of
                        // the world with it's initial data, and should NOT set creator (the system will do that)
                        entity.setAttribute('networked', {
                            template: "#script-data-media",
                            persistent: persistent,
                            owner: "scene",  // so that our initial value doesn't overwrite others
                            networkId: netId
                        });
                        this.el.sceneEl.appendChild(entity);
                    }

                    // save a pointer to the networked entity and then wait for it to be fully
                    // initialized before getting a pointer to the actual networked component in it
                    this.netEntity = entity;
                    NAF.utils.getNetworkedEntity(this.netEntity).then(networkedEl => {
                        this.stateSync = networkedEl.components["script-data"]

                        // if this is the first networked entity, it's sharedData will default to the empty 
                        // string, and we should initialize it with the initial data from the script
                        if (this.stateSync.sharedData === 0) {
                            let networked = networkedEl.components["networked"]
                            // if (networked.data.creator == NAF.clientId) {
                            //     this.stateSync.initSharedData(this.script.getSharedData())
                            // }
                        }
                    })
                }
                this.setupNetworkedEntity = this.setupNetworkedEntity.bind(this)

                this.setupNetworked = function () {
                    NAF.utils.getNetworkedEntity(this.el).then(networkedEl => {
                        this.setupNetworkedEntity(networkedEl)
                    }).catch(() => {
                        this.setupNetworkedEntity()
                    })
                }
                this.setupNetworked = this.setupNetworked.bind(this)

                // This method handles the different startup cases:
                // - if the GLTF was dropped on the scene, NAF will be connected and we can 
                //   immediately initialize
                // - if the GLTF is in the room scene or pinned, it will likely be created
                //   before NAF is started and connected, so we wait for an event that is
                //   fired when Hubs has started NAF
                if (NAF.connection && NAF.connection.isConnected()) {
                    this.setupNetworked();
                } else {
                    this.el.sceneEl.addEventListener('didConnectToNetworkedScene', this.setupNetworked)
                }
            }
        })
    },

    play: function () {
        if (this.script) {
            this.script.play()
        }
    },

    pause: function () {
        if (this.script) {
            this.script.pause()
        }
    },

    // handle "interact" events for clickable entities
    clicked: function(evt) {
        const obj = evt.object3D
        this.raycaster.ray.set(obj.position, this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate())
        const hit = this.script.webLayer3D.hitTest(this.raycaster.ray)
        if (hit) {
          hit.target.click()
          hit.target.focus()
          console.log('hit', hit.target, hit.layer)
        }   
    },
  
    // methods that will be passed to the html object so they can update networked data
    takeOwnership: function() {
        if (this.stateSync) {
            return this.stateSync.takeOwnership()
        } else {
            return true;  // sure, go ahead and change it for now
        }
    },
    
    setSharedData: function(dataObject) {
        if (this.stateSync) {
            return this.stateSync.setSharedData(dataObject)
        }
        return true
    },

    // this is called from below, to get the initial data from the script
    getSharedData: function() {
        if (this.script) {
            return this.script.getSharedData()
        }
        // shouldn't happen
        console.warn("script-data component called parent element but there is no script yet?")
        return "{}"
    },

    // per frame stuff
    tick: function (time) {
        if (!this.script) return

        if (this.script.isInteractive) {
            // more or less copied from "hoverable-visuals.js" in hubs
            const toggling = this.el.sceneEl.systems["hubs-systems"].cursorTogglingSystem;
            var passthruInteractor = []

            let interactorOne, interactorTwo;
            const interaction = this.el.sceneEl.systems.interaction;
            if (!interaction.ready) return; //DOMContentReady workaround
            
            if (interaction.state.leftHand.hovered === this.el && !interaction.state.leftHand.held) {
              interactorOne = interaction.options.leftHand.entity.object3D;
            }
            if (
              interaction.state.leftRemote.hovered === this.el &&
              !interaction.state.leftRemote.held &&
              !toggling.leftToggledOff
            ) {
              interactorOne = interaction.options.leftRemote.entity.object3D;
            }
            if (interactorOne) {
                let pos = interactorOne.position
                let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate()
                pos.addScaledVector(dir, -0.1)
                this.hoverRayL.set(pos, dir)

                passthruInteractor.push(this.hoverRayL)
            }
            if (
              interaction.state.rightRemote.hovered === this.el &&
              !interaction.state.rightRemote.held &&
              !toggling.rightToggledOff
            ) {
              interactorTwo = interaction.options.rightRemote.entity.object3D;
            }
            if (interaction.state.rightHand.hovered === this.el && !interaction.state.rightHand.held) {
                interactorTwo = interaction.options.rightHand.entity.object3D;
            }
            if (interactorTwo) {
                let pos = interactorTwo.position
                let dir = this.script.webLayer3D.getWorldDirection(new THREE.Vector3()).negate()
                pos.addScaledVector(dir, -0.1)
                this.hoverRayR.set(pos, dir)
                passthruInteractor.push(this.hoverRayR)
            }

            this.script.webLayer3D.interactionRays = passthruInteractor
        }

        if (this.script.isNetworked) {
            // if we haven't finished setting up the networked entity don't do anything.
            if (!this.netEntity || !this.stateSync) { return }

            // if the state has changed in the networked data, update our html object
            if (this.stateSync.changed) {
                this.stateSync.changed = false
                this.script.updateSharedData(this.stateSync.dataObject)
            }
        }
    },
  
  parseNodeName: function () {
        if (this.fullName === "") {
            this.fullName = this.el.parentEl.parentEl.className
        }

        // nodes should be named anything at the beginning with 
        //  "componentName"
        // at the very end.  This will fetch the component from the resource
        // componentName
        const params = this.fullName.match(/_([A-Za-z0-9]*)$/)

        // if pattern matches, we will have length of 3, first match is the dir,
        // second is the componentName name or number
        if (!params || params.length < 2) {
            console.warn("html-script componentName not formatted correctly: ", this.fullName)
            this.componentName = null
        } else {
            this.componentName = params[1]
        }
  },

  loadScript: async function () {
        var initScript = htmlComponents[this.componentName]
        if (!initScript) {
            console.warn("'html-script' component doesn't have script for " + this.componentName);
            this.script = null
            return;
        }
        this.script = initScript()
        if (this.script){
            this.script.webLayer3D.refresh(true)
            this.script.webLayer3D.update(true)
        } else {
            console.warn("'html-script' component failed to initialize script for " + this.componentName);
        }
    },

    destroyScript: function () {
        if (this.script.isInteractive) {
            // make the html object clickable
            this.el.removeAttribute('is-remote-hover-target')
            this.el.removeAttribute('tags')
            this.el.classList.remove("interactable")
            
            this.el.object3D.removeEventListener('interact', this.clicked)
        }
        this.el.object3D.remove(this.simpleContainer)
        this.simpleContainer = null

        this.script.destroy()
        this.script = null
    }
})

//
// Component for our networked state.  This component does nothing except all us to 
// change the state when appropriate. We could set this up to signal the component above when
// something has changed, instead of having the component above poll each frame.
//

AFRAME.registerComponent('script-data', {
    schema: {
        scriptdata: {type: "string", default: "{}"},
    },
    init: function () {
        this.takeOwnership = this.takeOwnership.bind(this);
        this.setSharedData = this.setSharedData.bind(this);

        this.dataObject = this.el.getSharedData();
        try {
            this.sharedData = encodeURIComponent(JSON.stringify(this.dataObject))
            this.el.setAttribute("script-data", "scriptdata", this.sharedData);
        } catch(e) {
            console.error("Couldn't encode initial script data object: ", e, this.dataObject)
            this.sharedData = "{}"
            this.dataObject = {}
        }
        this.changed = false;
    },

    update() {
        this.changed = !(this.sharedData === this.data.scriptdata);
        if (this.changed) {
            try {
                this.dataObject = JSON.parse(decodeURIComponent(this.data.scriptdata))

                // do these after the JSON parse to make sure it has succeeded
                this.sharedData = this.data.scriptdata;
                this.changed = true
            } catch(e) {
                console.error("couldn't parse JSON received in script-sync: ", e)
                this.sharedData = ""
                this.dataObject = {}
            }
        }
    },

    // it is likely that applyPersistentSync only needs to be called for persistent
    // networked entities, so we _probably_ don't need to do this.  But if there is no
    // persistent data saved from the network for this entity, this command does nothing.
    play() {
        if (this.el.components.networked) {
            // not sure if this is really needed, but can't hurt
            if (APP.utils) { // temporary till we ship new client
                APP.utils.applyPersistentSync(this.el.components.networked.data.networkId);
            }
        }
    },

    takeOwnership() {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        return true;
    },

    // initSharedData(dataObject) {
    //     try {
    //         var htmlString = encodeURIComponent(JSON.stringify(dataObject))
    //         this.sharedData = htmlString
    //         this.dataObject = dataObject
    //         return true
    //     } catch (e) {
    //         console.error("can't stringify the object passed to script-sync")
    //         return false
    //     }
    // },

    // The key part in these methods (which are called from the component above) is to
    // check if we are allowed to change the networked object.  If we own it (isMine() is true)
    // we can change it.  If we don't own in, we can try to become the owner with
    // takeOwnership(). If this succeeds, we can set the data.  
    //
    // NOTE: takeOwnership ATTEMPTS to become the owner, by assuming it can become the
    // owner and notifying the networked copies.  If two or more entities try to become
    // owner,  only one (the last one to try) becomes the owner.  Any state updates done
    // by the "failed attempted owners" will not be distributed to the other clients,
    // and will be overwritten (eventually) by updates from the other clients.   By not
    // attempting to guarantee ownership, this call is fast and synchronous.  Any 
    // methods for guaranteeing ownership change would take a non-trivial amount of time
    // because of network latencies.

    setSharedData(dataObject) {
        if (!NAF.utils.isMine(this.el) && !NAF.utils.takeOwnership(this.el)) return false;

        try {
            var htmlString = encodeURIComponent(JSON.stringify(dataObject))
            this.sharedData = htmlString
            this.dataObject = dataObject
            this.el.setAttribute("script-data", "scriptdata", htmlString);
            return true
        } catch (e) {
            console.error("can't stringify the object passed to script-sync")
            return false
        }
    }
});

// Add our template for our networked object to the a-frame assets object,
// and a schema to the NAF.schemas.  Both must be there to have custom components work

const assets = document.querySelector("a-assets");

assets.insertAdjacentHTML(
    'beforeend',
    `
    <template id="script-data-media">
      <a-entity
        script-data
      ></a-entity>
    </template>
  `
  )

const vectorRequiresUpdate = epsilon => {
		return () => {
			let prev = null;
			return curr => {
				if (prev === null) {
					prev = new THREE.Vector3(curr.x, curr.y, curr.z);
					return true;
				} else if (!NAF.utils.almostEqualVec3(prev, curr, epsilon)) {
					prev.copy(curr);
					return true;
				}
				return false;
			};
		};
	};

NAF.schemas.add({
  	template: "#script-data-media",
    components: [
    // {
    //     component: "script-data",
    //     property: "rotation",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    // {
    //     component: "script-data",
    //     property: "scale",
    //     requiresNetworkUpdate: vectorRequiresUpdate(0.001)
    // },
    {
      	component: "script-data",
      	property: "scriptdata"
    }],
      nonAuthorizedComponents: [
      {
            component: "script-data",
            property: "scriptdata"
      }
    ],

  });

