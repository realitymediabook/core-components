/**
 * Description
 * ===========
 * Bidirectional see-through portal. Two portals are paired by color.
 *
 * Usage
 * =======
 * Add two instances of `portal.glb` to the Spoke scene.
 * The name of each instance should look like "some-descriptive-label__color"
 * Any valid THREE.Color argument is a valid color value.
 * See here for example color names https://www.w3schools.com/cssref/css_colors.asp
 *
 * For example, to make a pair of connected blue portals,
 * you could name them "portal-to__blue" and "portal-from__blue"
 */
import * as htmlComponents from "https://resources.realitymedia.digital/vue-apps/dist/hubs.js";
//  import "https://resources.realitymedia.digital/vue-apps/dist/hubs.js";
// let htmlComponents = window.APP.vueApps

import './proximity-events.js'
// import vertexShader from '../shaders/portal.vert.js'
// import fragmentShader from '../shaders/portal.frag.js'
// import snoise from '../shaders/snoise'

import { showRegionForObject, hiderRegionForObject } from './region-hider.js'
import { findAncestorWithComponent } from '../utils/scene-graph'
import { updateWithShader } from './shader'
import { WarpPortalShader } from '../shaders/warp-portal.js'

import goldcolor from '../assets/Metal_Gold_Foil_002_COLOR.jpg'
import goldDisplacement from '../assets/Metal_Gold_Foil_002_DISP.jpg'
import goldgloss from '../assets/Metal_Gold_Foil_002_glossiness.png'
import goldnorm from '../assets/Metal_Gold_Foil_002_NRM.jpg'
import goldao from '../assets/Metal_Gold_Foil_002_OCC.jpg'

import CubeCameraWriter from "../utils/writeCubeMap.js";

import { Marble1Shader } from '../shaders/marble1'
import { replaceMaterial as replaceWithShader} from './shader'

const worldPos = new THREE.Vector3()
const worldCameraPos = new THREE.Vector3()
const worldDir = new THREE.Vector3()
const worldQuat = new THREE.Quaternion()
const mat4 = new THREE.Matrix4()

// load and setup all the bits of the textures for the door
const loader = new THREE.TextureLoader()
const doorMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.0, 
    //emissiveIntensity: 1
})
const doormaterialY = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0, 
    //emissiveIntensity: 1
})

loader.load(goldcolor, (color) => {
    doorMaterial.map = color;
    color.repeat.set(1,25)
    color.wrapS = THREE.RepeatWrapping;
    color.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true
})
loader.load(goldcolor, (color) => {
    //color = color.clone()
    doormaterialY.map = color;
    color.repeat.set(1,1)
    color.wrapS = THREE.ClampToEdgeWrapping;
    color.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true
})

loader.load(goldDisplacement, (disp) => {
    doorMaterial.bumpMap = disp;
    disp.repeat.set(1,25)
    disp.wrapS = THREE.RepeatWrapping;
    disp.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true
})

loader.load(goldDisplacement, (disp) => {
    //disp = disp.clone()
    doormaterialY.bumpMap = disp;
    disp.repeat.set(1,1)
    disp.wrapS = THREE.ClampToEdgeWrapping;
    disp.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true
})

loader.load(goldgloss, (gloss) => {
    doorMaterial.roughness = gloss
    gloss.repeat.set(1,25)
    gloss.wrapS = THREE.RepeatWrapping;
    gloss.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true
})

loader.load(goldgloss, (gloss) => {
    //gloss = gloss.clone()
    doormaterialY.roughness = gloss
    gloss.repeat.set(1,1)
    gloss.wrapS = THREE.ClampToEdgeWrapping;
    gloss.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true
})
         
loader.load(goldao, (ao) => {
    doorMaterial.aoMap = ao
    ao.repeat.set(1,25)
    ao.wrapS = THREE.RepeatWrapping;
    ao.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true
})
         
loader.load(goldao, (ao) => {
    // ao = ao.clone()
    doormaterialY.aoMap = ao
    ao.repeat.set(1,1)
    ao.wrapS = THREE.ClampToEdgeWrapping;
    ao.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true
})

loader.load(goldnorm, (norm) => {
    doorMaterial.normalMap = norm;
    norm.repeat.set(1,25)
    norm.wrapS = THREE.RepeatWrapping;
    norm.wrapT = THREE.RepeatWrapping;
    doorMaterial.needsUpdate = true
})

loader.load(goldnorm, (norm) => {
    // norm = norm.clone()
    doormaterialY.normalMap = norm;
    norm.repeat.set(1,1)
    norm.wrapS = THREE.ClampToEdgeWrapping;
    norm.wrapT = THREE.ClampToEdgeWrapping;
    doormaterialY.needsUpdate = true
})

// // map all materials via a callback.  Taken from hubs materials-utils
// function mapMaterials(object3D, fn) {
//     let mesh = object3D 
//     if (!mesh.material) return;
  
//     if (Array.isArray(mesh.material)) {
//       return mesh.material.map(fn);
//     } else {
//       return fn(mesh.material);
//     }
// }
  
AFRAME.registerSystem('portal', {
  dependencies: ['fader-plus'],
  init: function () {
    this.teleporting = false
    this.characterController = this.el.systems['hubs-systems'].characterController
    this.fader = this.el.systems['fader-plus']
    // this.roomData = null
    this.waitForFetch = this.waitForFetch.bind(this)

    // if the user is logged in, we want to retrieve their userData from the top level server
    // if (window.APP.store.state.credentials && window.APP.store.state.credentials.token && !window.APP.userData) {
    //     this.fetchRoomData()
    // }
  },
//   fetchRoomData: async function () {
//     var params = {token: window.APP.store.state.credentials.token,
//                   room_id: window.APP.hubChannel.hubId}

//     const options = {};
//     options.headers = new Headers();
//     options.headers.set("Authorization", `Bearer ${params}`);
//     options.headers.set("Content-Type", "application/json");
//     await fetch("https://realitymedia.digital/userData", options)
//         .then(response => response.json())
//         .then(data => {
//           console.log('Success:', data);
//           this.roomData = data;
//     })
//     this.roomData.textures = []
//   },
  getRoomURL: async function (number) {
      this.waitForFetch()
      //return this.roomData.rooms.length > number ? "https://xr.realitymedia.digital/" + this.roomData.rooms[number] : null;
      let url = window.SSO.userInfo.rooms.length > number ? "https://xr.realitymedia.digital/" + window.SSO.userInfo.rooms[number] : null;
      return url
  },
  getCubeMap: async function (number, waypoint) {
      this.waitForFetch()

      if (!waypoint || waypoint.length == 0) {
          waypoint = "start"
      }
      let urls = ["Right","Left","Top","Bottom","Front","Back"].map(el => {
          return "https://resources.realitymedia.digital/data/roomPanos/" + number.toString() + "/" + waypoint + "-" + el + ".png"
      })
      return urls
      //return this.roomData.cubemaps.length > number ? this.roomData.cubemaps[number] : null;
  },
  waitForFetch: function () {
     if (window.SSO.userInfo) return
     setTimeout(this.waitForFetch, 100); // try again in 100 milliseconds
  },
  teleportTo: async function (object) {
    this.teleporting = true
    await this.fader.fadeOut()
    // Scale screws up the waypoint logic, so just send position and orientation
    object.getWorldQuaternion(worldQuat)
    object.getWorldDirection(worldDir)
    object.getWorldPosition(worldPos)
    worldPos.add(worldDir.multiplyScalar(3)) // Teleport in front of the portal to avoid infinite loop
    mat4.makeRotationFromQuaternion(worldQuat)
    mat4.setPosition(worldPos)
    // Using the characterController ensures we don't stray from the navmesh
    this.characterController.travelByWaypoint(mat4, true, false)
    await this.fader.fadeIn()
    this.teleporting = false
  },
})

AFRAME.registerComponent('portal', {
    schema: {
        portalType: { default: "" },
        portalTarget: { default: "" },
        secondaryTarget: { default: "" },
        color: { type: 'color', default: null },
        materialTarget: { type: 'string', default: null },
        drawDoor: { type: 'boolean', default: false },
        text: { type: 'string', default: null},
        textPosition: { type: 'vec3' },
        textSize: { type: 'vec2' },
        textScale: { type: 'number', default: 1 }
    },

    init: function () {
        // TESTING
        //this.data.drawDoor = true
        // this.data.mainText = "Portal to the Abyss"
        // this.data.secondaryText = "To visit the Abyss, go through the door!"

        // A-Frame is supposed to do this by default but doesn't seem to?
        this.system = window.APP.scene.systems.portal 

        if (this.data.portalType.length > 0 ) {
            this.setPortalInfo(this.data.portalType, this.data.portalTarget, this.data.color)
        } else {
            this.portalType = 0
        }

        if (this.portalType == 0) {
            // parse the name to get portal type, target, and color
            this.parseNodeName()
        }
        
        // wait until the scene loads to finish.  We want to make sure everything
        // is initialized
        let root = findAncestorWithComponent(this.el, "gltf-model-plus")
        root && root.addEventListener("model-loaded", (ev) => { 
            this.initialize()
        });
    },

    initialize: async function () {
        // this.material = new THREE.ShaderMaterial({
        //   transparent: true,
        //   side: THREE.DoubleSide,
        //   uniforms: {
        //     cubeMap: { value: new THREE.Texture() },
        //     time: { value: 0 },
        //     radius: { value: 0 },
        //     ringColor: { value: this.color },
        //   },
        //   vertexShader,
        //   fragmentShader: `
        //     ${snoise}
        //     ${fragmentShader}
        //   `,
        // })

        // Assume that the object has a plane geometry
        //const mesh = this.el.getOrCreateObject3D('mesh')
        //mesh.material = this.material

        this.materials = null
        this.radius = 0.2
        this.cubeMap = new THREE.CubeTexture()

        // get the other before continuing
        this.other = await this.getOther()

        this.el.setAttribute('animation__portal', {
            property: 'components.portal.radius',
            dur: 700,
            easing: 'easeInOutCubic',
        })
        
        // this.el.addEventListener('animationbegin', () => (this.el.object3D.visible = true))
        // this.el.addEventListener('animationcomplete__portal', () => (this.el.object3D.visible = !this.isClosed()))

        // going to want to try and make the object this portal is on clickable
        // this.el.setAttribute('is-remote-hover-target','')
        // this.el.setAttribute('tags', {singleActionButton: true})
        //this.el.setAttribute('class', "interactable")
        // orward the 'interact' events to our portal movement 
        //this.followPortal = this.followPortal.bind(this)
        //this.el.object3D.addEventListener('interact', this.followPortal)

        if ( this.el.components["media-loader"] || this.el.components["media-image"] ) {
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    this.setupPortal();
                    if (this.data.drawDoor) {
                        this.setupDoor();
                    }
                    this.el.removeEventListener('model-loaded', fn)
                 }
                this.el.addEventListener("media-loaded", fn)
            } else {
                this.setupPortal()
                if (this.data.drawDoor) {
                    this.setupDoor();
                }
            }
        } else {
            this.setupPortal()
            if (this.data.drawDoor) {
                this.setupDoor();
            }
        }
    },

    setupPortal: function () {
        // get rid of interactivity
        if (this.el.classList.contains("interactable")) {
            this.el.classList.remove("interactable")
        }
        this.el.removeAttribute("is-remote-hover-target")
        
        let target = this.data.materialTarget
        if (target && target.length == 0) {target=null}
    
        this.materials = updateWithShader(WarpPortalShader, this.el, target, {
            radius: this.radius,
            ringColor: this.color,
            cubeMap: this.cubeMap,
            invertWarpColor: this.portalType == 1 ? 1 : 0
        })

        if (this.portalType == 1) {
            this.system.getCubeMap(this.portalTarget, this.data.secondaryTarget).then( urls => {
                //const urls = [cubeMapPosX, cubeMapNegX, cubeMapPosY, cubeMapNegY, cubeMapPosZ, cubeMapNegZ];
                const texture = new Promise((resolve, reject) =>
                  new THREE.CubeTextureLoader().load(urls, resolve, undefined, reject)
                ).then(texture => {
                    texture.format = THREE.RGBFormat;
                    //this.material.uniforms.cubeMap.value = texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = texture;})
                    this.cubeMap = texture
                }).catch(e => console.error(e))    
            })
        } else if (this.portalType == 2 || this.portalType == 3) {    
            this.cubeCamera = new CubeCameraWriter(0.1, 1000, 1024)
            //this.cubeCamera.rotateY(Math.PI) // Face forwards
            if (this.portalType == 2) {
                this.el.object3D.add(this.cubeCamera)
                // this.other.components.portal.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture 
                //this.other.components.portal.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                this.other.components.portal.cubeMap = this.cubeCamera.renderTarget.texture
            } else {
                let waypoint = document.getElementsByClassName(this.portalTarget)
                if (waypoint.length > 0) {
                    waypoint = waypoint.item(0)
                    this.cubeCamera.position.y = 1.6
                    this.cubeCamera.needsUpdate = true
                    waypoint.object3D.add(this.cubeCamera)
                    // this.material.uniforms.cubeMap.value = this.cubeCamera.renderTarget.texture;
                    //this.materials.map((mat) => {mat.userData.cubeMap = this.cubeCamera.renderTarget.texture;})
                    this.cubeMap = this.cubeCamera.renderTarget.texture
                }
            }
            this.el.sceneEl.addEventListener('model-loaded', () => {
                showRegionForObject(this.el)
                this.cubeCamera.update(this.el.sceneEl.renderer, this.el.sceneEl.object3D)
                // this.cubeCamera.renderTarget.texture.generateMipmaps = true
                // this.cubeCamera.renderTarget.texture.needsUpdate = true
                hiderRegionForObject(this.el)
            })
        }

        let scaleM = this.el.object3DMap["mesh"].scale
        let scaleI = this.el.object3D.scale
        let scaleX = scaleM.x * scaleI.x
        let scaleY = scaleM.y * scaleI.y
        let scaleZ = scaleM.z * scaleI.z

        // this.portalWidth = scaleX / 2
        // this.portalHeight = scaleY / 2

        // offset to center of portal assuming walking on ground
        // this.Yoffset = -(this.el.object3D.position.y - 1.6)
        this.Yoffset = -(scaleY/2 - 1.6)

        this.el.setAttribute('proximity-events', { radius: 4, Yoffset: this.Yoffset })
        this.el.addEventListener('proximityenter', () => this.open())
        this.el.addEventListener('proximityleave', () => this.close())
    
        var titleScriptData = {
            width: this.data.textSize.x,
            height: this.data.textSize.y,
            message: this.data.text
        }
        const portalTitle = htmlComponents["PortalTitle"]
        // const portalSubtitle = htmlComponents["PortalSubtitle"]

        this.portalTitle = portalTitle(titleScriptData)
        // this.portalSubtitle = portalSubtitle(subtitleScriptData)

        this.el.setObject3D('portalTitle', this.portalTitle.webLayer3D)
        let size = this.portalTitle.getSize()
        let titleScaleX = scaleX / this.data.textScale
        let titleScaleY = scaleY / this.data.textScale
        let titleScaleZ = scaleZ / this.data.textScale

        this.portalTitle.webLayer3D.scale.x /= titleScaleX
        this.portalTitle.webLayer3D.scale.y /= titleScaleY
        this.portalTitle.webLayer3D.scale.z /= titleScaleZ

        this.portalTitle.webLayer3D.position.x = this.data.textPosition.x / scaleX
        this.portalTitle.webLayer3D.position.y = 0.5 + size.height / 2 + this.data.textPosition.y / scaleY
        this.portalTitle.webLayer3D.position.z = this.data.textPosition.z / scaleY
        // this.el.setObject3D('portalSubtitle', this.portalSubtitle.webLayer3D)
        // this.portalSubtitle.webLayer3D.position.x = 1
        this.el.setObject3D.matrixAutoUpdate = true
        this.portalTitle.webLayer3D.matrixAutoUpdate = true
        // this.portalSubtitle.webLayer3D.matrixAutoUpdate = true

        // this.materials.map((mat) => {
        //     mat.userData.radius = this.radius
        //     mat.userData.ringColor = this.color
        //     mat.userData.cubeMap = this.cubeMap
        // })
    },
        //   replaceMaterial: function (newMaterial) {
//     let target = this.data.materialTarget
//     if (target && target.length == 0) {target=null}
    
//     let traverse = (object) => {
//       let mesh = object
//       if (mesh.material) {
//           mapMaterials(mesh, (material) => {         
//               if (!target || material.name === target) {
//                   mesh.material = newMaterial
//               }
//           })
//       }
//       const children = object.children;
//       for (let i = 0; i < children.length; i++) {
//           traverse(children[i]);
//       }
//     }

//     let replaceMaterials = () => {
//         // mesh would contain the object that is, or contains, the meshes
//         var mesh = this.el.object3DMap.mesh
//         if (!mesh) {
//             // if no mesh, we'll search through all of the children.  This would
//             // happen if we dropped the component on a glb in spoke
//             mesh = this.el.object3D
//         }
//         traverse(mesh);
//        // this.el.removeEventListener("model-loaded", initializer);
//     }

//     // let root = findAncestorWithComponent(this.el, "gltf-model-plus")
//     // let initializer = () =>{
//       if (this.el.components["media-loader"]) {
//           this.el.addEventListener("media-loaded", replaceMaterials)
//       } else {
//           replaceMaterials()
//       }
//     // };
//     //replaceMaterials()
//     // root.addEventListener("model-loaded", initializer);
//   },

//   followPortal: function() {
//     if (this.portalType == 1) {
//         console.log("set window.location.href to " + this.other)
//         window.location.href = this.other
//       } else if (this.portalType == 2) {
//         this.system.teleportTo(this.other.object3D)
//       }
//   },

    setupDoor: function() {
        // attached to an image in spoke.  This is the only way we allow buidling a 
        // door around it
        let scaleM = this.el.object3DMap["mesh"].scale
        let scaleI = this.el.object3D.scale
        var width = scaleM.x * scaleI.x
        var height = scaleM.y * scaleI.y
        var depth = 1.0; //  scaleM.z * scaleI.z

        const environmentMapComponent = this.el.sceneEl.components["environment-map"];

        // let above = new THREE.Mesh(
        //     new THREE.SphereGeometry(1, 50, 50),
        //     doormaterialY 
        // );
        // if (environmentMapComponent) {
        //     environmentMapComponent.applyEnvironmentMap(above);
        // }
        // above.position.set(0, 2.5, 0)
        // this.el.object3D.add(above)

        let left = new THREE.Mesh(
            // new THREE.BoxGeometry(0.1/width,2/height,0.1/depth,2,5,2),
            new THREE.BoxGeometry(0.1/width,1,0.1/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(left);
        }
        left.position.set(-0.51, 0, 0)
        this.el.object3D.add(left)

        let right = new THREE.Mesh(
            new THREE.BoxGeometry(0.1/width,1,0.1/depth,2,5,2),
            [doorMaterial,doorMaterial,doormaterialY, doormaterialY,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(right);
        }
        right.position.set(0.51, 0, 0)
        this.el.object3D.add(right)

        let top = new THREE.Mesh(
            new THREE.BoxGeometry(1 + 0.3/width,0.1/height,0.1/depth,2,5,2),
            [doormaterialY,doormaterialY,doorMaterial,doorMaterial,doorMaterial,doorMaterial], 
        );

        if (environmentMapComponent) {
            environmentMapComponent.applyEnvironmentMap(top);
        }
        top.position.set(0.0, 0.505, 0)
        this.el.object3D.add(top)

        // if (width > 0 && height > 0) {
        //     const {width: wsize, height: hsize} = this.script.getSize()
        //     var scale = Math.min(width / wsize, height / hsize)
        //     this.simpleContainer.setAttribute("scale", { x: scale, y: scale, z: scale});
        // }
    },

    tick: function (time) {
        //this.material.uniforms.time.value = time / 1000
        if (!this.materials) { return }

        this.portalTitle.tick(time)
        // this.portalSubtitle.tick(time)

        this.materials.map((mat) => {
            mat.userData.radius = this.radius
            mat.userData.cubeMap = this.cubeMap
            WarpPortalShader.updateUniforms(time, mat)
        })

        if (this.other && !this.system.teleporting) {
        //   this.el.object3D.getWorldPosition(worldPos)
        //   this.el.sceneEl.camera.getWorldPosition(worldCameraPos)
        //   worldCameraPos.y -= this.Yoffset
        //   const dist = worldCameraPos.distanceTo(worldPos)
          this.el.sceneEl.camera.getWorldPosition(worldCameraPos)
          this.el.object3D.worldToLocal(worldCameraPos)

          // in local portal coordinates, the width and height are 1
          if (Math.abs(worldCameraPos.x) > 0.5 || Math.abs(worldCameraPos.y) > 0.5) {
            return;
          }
          const dist = Math.abs(worldCameraPos.z);

          if (this.portalType == 1 && dist < 0.25) {
              if (!this.locationhref) {
                console.log("set window.location.href to " + this.other)
                this.locationhref = this.other
                window.location.href = this.other
              }
          } else if (this.portalType == 2 && dist < 0.25) {
            this.system.teleportTo(this.other.object3D)
          } else if (this.portalType == 3) {
              if (dist < 0.25) {
                if (!this.locationhref) {
                  console.log("set window.location.hash to " + this.other)
                  this.locationhref = this.other
                  window.location.hash = this.other
                }
              } else {
                  // if we set locationhref, we teleported.  when it
                  // finally happens, and we move outside the range of the portal,
                  // we will clear the flag
                  this.locationhref = null
              }
          }
        }
      },

    getOther: function () {
        return new Promise((resolve) => {
            if (this.portalType == 0) resolve(null)
            if (this.portalType  == 1) {
                // the target is another room, resolve with the URL to the room
                this.system.getRoomURL(this.portalTarget).then(url => { 
                    if (this.data.secondaryTarget && this.data.secondaryTarget.length > 0) {
                        resolve(url + "#" + this.data.secondaryTarget)
                    } else {
                        resolve(url) 
                    }
                })
                return
            }
            if (this.portalType == 3) {
                resolve ("#" + this.portalTarget)
            }

            // now find the portal within the room.  The portals should come in pairs with the same portalTarget
            const portals = Array.from(document.querySelectorAll(`[portal]`))
            const other = portals.find((el) => el.components.portal.portalType == this.portalType &&
                          el.components.portal.portalTarget === this.portalTarget && 
                          el !== this.el)
            if (other !== undefined) {
                // Case 1: The other portal already exists
                resolve(other);
                other.emit('pair', { other: this.el }) // Let the other know that we're ready
            } else {
                // Case 2: We couldn't find the other portal, wait for it to signal that it's ready
                this.el.addEventListener('pair', (event) => { 
                    resolve(event.detail.other)
                }, { once: true })
            }
        })
    },

    parseNodeName: function () {
        const nodeName = this.el.parentEl.parentEl.className

        // nodes should be named anything at the beginning with either 
        // - "room_name_color"
        // - "portal_N_color" 
        // at the very end. Numbered portals should come in pairs.
        const params = nodeName.match(/([A-Za-z]*)_([A-Za-z0-9]*)_([A-Za-z0-9]*)$/)
        
        // if pattern matches, we will have length of 4, first match is the portal type,
        // second is the name or number, and last is the color
        if (!params || params.length < 4) {
            console.warn("portal node name not formed correctly: ", nodeName)
            this.portalType = 0
            this.portalTarget = null
            this.color = "red" // default so the portal has a color to use
            return;
        } 
        this.setPortalInfo(params[1], params[2], params[3])
    },

    setPortalInfo: function(portalType, portalTarget, color) {
        if (portalType === "room") {
            this.portalType = 1;
            this.portalTarget = parseInt(portalTarget)
        } else if (portalType === "portal") {
            this.portalType = 2;
            this.portalTarget = portalTarget
        } else if (portalType === "waypoint") {
            this.portalType = 3;
            this.portalTarget = portalTarget
        } else {
            this.portalType = 0;
            this.portalTarget = null
        } 
        this.color = new THREE.Color(color)
    },

    setRadius(val) {
        this.el.setAttribute('animation__portal', {
        //   from: this.material.uniforms.radius.value,
            from: this.radius,
            to: val,
        })
    },
    open() {
        this.setRadius(1)
    },
    close() {
        this.setRadius(0.2)
    },
    isClosed() {
        // return this.material.uniforms.radius.value === 0
        return this.radius === 0.2
    },
})
