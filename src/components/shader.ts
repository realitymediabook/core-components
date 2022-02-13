/**
 * Various simple shaders
 */

// https://www.shadertoy.com/view/MsXSzM:  Bleepy Blocks
import { ShaderExtension, ExtendedMaterial, DefaultMaterialModifier as MaterialModifier, ShaderExtensionOpts } from '../utils/MaterialModifier'
import { findAncestorWithComponent } from '../utils/scene-graph'

// add  https://www.shadertoy.com/view/7dKGzz

import { BleepyBlocksShader } from '../shaders/bleepy-blocks-shader'
import { NoiseShader } from '../shaders/noise'
import { LiquidMarbleShader } from '../shaders/liquid-marble'
import { GalaxyShader } from '../shaders/galaxy'
import { LaceTunnelShader } from '../shaders/lace-tunnel'
import { FireTunnelShader } from '../shaders/fire-tunnel'
import { MistShader } from '../shaders/mist'
import { Marble1Shader } from '../shaders/marble1'
import { NotFoundShader } from '../shaders/not-found'
import { WarpShader } from '../shaders/warp'
import { WarpPortalShader } from '../shaders/warp-portal'

function mapMaterials(object3D: THREE.Object3D, fn: (material: THREE.Material) => void) {
    let mesh = object3D as THREE.Mesh
    if (!mesh.material) return;
  
    if (Array.isArray(mesh.material)) {
      return mesh.material.map(fn);
    } else {
      return fn(mesh.material);
    }
}
  
  // TODO:  key a record of new materials, indexed by the original
  // material UUID, so we can just return it if replace is called on
  // the same material more than once
  export function replaceMaterial (oldMaterial: THREE.Material, shader: ShaderExtension, userData: any): null | THREE.Material & ExtendedMaterial {
    //   if (oldMaterial.type != "MeshStandardMaterial") {
    //       console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
    //       return;
    //   }

      //const material = oldMaterial.clone();
      var CustomMaterial
      try {
          CustomMaterial = MaterialModifier.extend (oldMaterial.type, {
            uniforms: shader.uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader
          })
      } catch(e) {
          return null;
      }

      // create a new material, initializing the base part with the old material here
      let material = new CustomMaterial()

      switch (oldMaterial.type) {
          case "MeshStandardMaterial":
              THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial)
              break;
          case "MeshPhongMaterial":
              THREE.MeshPhongMaterial.prototype.copy.call(material, oldMaterial)
              break;
          case "MeshBasicMaterial":
              THREE.MeshBasicMaterial.prototype.copy.call(material, oldMaterial)
              break;
      }

      material.userData = userData;
      material.needsUpdate = true;
      shader.init(material);
      
      return material
  }

export function updateWithShader(shaderDef: ShaderExtension, el: any, target: string, userData: any = {}): (THREE.Material & ExtendedMaterial)[] {
    // mesh would contain the object that is, or contains, the meshes
    var mesh = el.object3DMap.mesh
    if (!mesh) {
        // if no mesh, we'll search through all of the children.  This would
        // happen if we dropped the component on a glb in spoke
        mesh = el.object3D
    }
    
    let materials: any = []
    let traverse = (object: THREE.Object3D) => {
      let mesh = object as THREE.Mesh
      if (mesh.material) {
          mapMaterials(mesh, (material: THREE.Material) => {         
              if (!target || material.name === target) {
                  let newM = replaceMaterial(material, shaderDef, userData)
                  if (newM) {
                      mesh.material = newM

                      materials.push(newM)
                  }
              }
          })
      }
      const children = object.children;
      for (let i = 0; i < children.length; i++) {
          traverse(children[i]);
      }
    }

    traverse(mesh);
    return materials
  }

const vec = new THREE.Vector3()
const forward = new THREE.Vector3(0, 0, 1)

const once = {
    once : true
};

AFRAME.registerComponent('shader', {
    materials: null as (THREE.Material & ExtendedMaterial)[] | null,  
    shaderDef: null as ShaderExtension | null,

    schema: {
        name: { type: 'string', default: "noise" },
        target: { type: 'string', default: "" }  // if nothing passed, just create some noise
    },

    init: function () {
        var shaderDef: ShaderExtension;

        switch (this.data.name) {
            case "noise":
                shaderDef = NoiseShader
                break;

            case "warp":
                shaderDef = WarpShader
                break;

            case "warp-portal":
                shaderDef = WarpPortalShader
                break;

            case "liquidmarble":
                shaderDef = LiquidMarbleShader
                break;
        
            case "bleepyblocks":
                shaderDef = BleepyBlocksShader
                break;

            case "galaxy":
                shaderDef = GalaxyShader
                break;

            case "lacetunnel":
                shaderDef = LaceTunnelShader
                break;

            case "firetunnel":
                shaderDef = FireTunnelShader
                break;
        
            case "mist":
                shaderDef = MistShader
                break;

            case "marble1":
                shaderDef = Marble1Shader
                break;

            default:
                // an unknown name was passed in
                console.warn("unknown name '" + this.data.name + "' passed to shader component")
                shaderDef = NotFoundShader
                break;
        } 

        let root = findAncestorWithComponent(this.el, "gltf-model-plus")
        let updateMaterials = () =>{
            let target = this.data.target
            if (target.length == 0) {target=null}
            
            this.materials = updateWithShader(shaderDef, this.el, target);
        }

        let initializer = () =>{
            if (this.el.components["media-loader"]) {
                let fn = () => {
                    updateMaterials()
                    this.el.removeEventListener("model-loaded", fn);
                }

                this.el.addEventListener("media-loaded", fn)
            } else {
                updateMaterials()
            }
        }
        root && (root as HTMLElement).addEventListener("model-loaded", initializer, once);
        this.shaderDef = shaderDef
    },


  tick: function(time) {
    if (this.shaderDef == null || this.materials == null) { return }

    let shaderDef = this.shaderDef
    this.materials.map((mat) => {shaderDef.updateUniforms(time, mat)})
    // switch (this.data.name) {
    //     case "noise":
    //         break;
    //     case "bleepyblocks":
    //         break;
    //     default:
    //         break;
    // }

    // if (this.shader) {
    //     console.log("fragment shader:", this.material.fragmentShader)
    //     this.shader = null
    // }
  },
})

