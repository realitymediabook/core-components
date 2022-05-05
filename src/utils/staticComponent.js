import {
    findAncestorWithComponent
} from "./scene-graph";

// template

export function staticComponentTemplate(componentName) {
    return {
        startInit: function () {
            this.fullName = this.el.parentEl.parentEl.className
            this.relativeSize = 1;
        },        
        
        finishInit: function () {
            let root = findAncestorWithComponent(this.el, "gltf-model-plus")
            root && root.addEventListener("model-loaded", (ev) => {
                this.internalInit()
            });
        },

        removeTemplate: function () {
            this.el.removeChild(this.simpleContainer)
            this.simpleContainer = null
        },

        internalInit: function () {
            // each time we load a component we will possibly create
            // a new networked component.  This is fine, since the networked Id 
            // is based on the name passed as a parameter, or assigned to the
            // component in Spoke.  It does mean that if we have
            // multiple objects in the scene which have the same name, they will
            // be in sync.  It also means that if you want to drop a component on
            // the scene via a .glb, it must have a valid name parameter inside it.
            // A .glb in spoke will fall back to the spoke name if you use one without
            // a name inside it.
            let loader = () => {
                // lets load something externally, like a json config file
                this.loadData().then(() => {
                    // set up the local content and hook it to the scene
                    this.simpleContainer = document.createElement('a-entity')
                    this.simpleContainer.object3D.matrixAutoUpdate = true

                    this.initializeData()
                    // lets figure out the scale, by scaling to fill the a 1x1m square, that has also
                    // potentially been scaled by the parents parent node. If we scale the entity in spoke,
                    // this is where the scale is set.  If we drop a node in and scale it, the scale is also
                    // set there.

                    // TODO: need to find environment-scene, go down two levels to the group above 
                    // the nodes in the scene.  Then accumulate the scales up from this node to
                    // that node.  This will account for groups, and nesting.

                    var width = 1,
                        height = 1;
                    if (this.el.components["media-image"]) {
                        // attached to an image in spoke, so the image mesh is size 1 and is scaled directly
                        let scaleM = this.el.object3DMap["mesh"].scale
                        let scaleI = this.el.object3D.scale
                        width = scaleM.x * scaleI.x
                        height = scaleM.y * scaleI.y
                        scaleI.x = 1
                        scaleI.y = 1
                        scaleI.z = 1
                        this.el.object3D.matrixNeedsUpdate = true;
                    } else {
                        // PROBABLY DONT NEED TO SUPPORT THIS ANYMORE
                        // it's embedded in a simple gltf model;  other models may not work
                        // we assume it's at the top level mesh, and that the model itself is scaled
                        let mesh = this.el.object3DMap["mesh"]
                        if (mesh) {
                            let box = mesh.geometry.boundingBox;
                            width = (box.max.x - box.min.x) * mesh.scale.x
                            height = (box.max.y - box.min.y) * mesh.scale.y
                        } else {
                            let meshScale = this.el.object3D.scale
                            width = meshScale.x
                            height = meshScale.y
                            meshScale.x = 1
                            meshScale.y = 1
                            meshScale.z = 1
                            this.el.object3D.matrixNeedsUpdate = true;
                        }
                        // apply the root gltf scale.
                        var parent2 = this.el.parentEl.parentEl.object3D
                        width *= parent2.scale.x
                        height *= parent2.scale.y
                        parent2.scale.x = 1
                        parent2.scale.y = 1
                        parent2.scale.z = 1
                        parent2.matrixNeedsUpdate = true;
                    }

                    if (width > 0 && height > 0) {
                        var scale = Math.min(width * this.relativeSize, height * this.relativeSize)
                        this.simpleContainer.setAttribute("scale", {
                            x: scale,
                            y: scale,
                            z: scale
                        });
                    }

                    // there might be some elements already, like the cube we created in blender
                    // and attached this component to, so hide them if they are there.
                    for (const c of this.el.object3D.children) {
                        c.visible = false;
                    }

                    // add in our container
                    this.el.appendChild(this.simpleContainer)

                    // TODO:  we are going to have to make sure this works if 
                    // the component is ON an interactable (like an image)

                    // no interactivity, please
                    if (this.el.classList.contains("interactable")) {
                        this.el.classList.remove("interactable")
                    }
                    this.el.removeAttribute("is-remote-hover-target")
                })
            }
            // if attached to a node with a media-loader component, this means we attached this component
            // to a media object in Spoke.  We should wait till the object is fully loaded.  
            // Otherwise, it was attached to something inside a GLTF (probably in blender)
            if (this.el.components["media-loader"]) {
                this.el.addEventListener("media-loaded", () => {
                    loader()
                }, {
                    once: true
                })
            } else {
                loader()
            }
        }
    }
}