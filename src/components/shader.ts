/**
 * Various simple shaders
 */

// https://www.shadertoy.com/view/MsXSzM:  Bleepy Blocks
import { ShaderExtension, ExtendedMaterial, DefaultMaterialModifier as MaterialModifier } from '../utils/MaterialModifier'
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

function mapMaterials(object3D: THREE.Object3D, fn: (material: THREE.Material) => void) {
    let mesh = object3D as THREE.Mesh
    if (!mesh.material) return;
  
    if (Array.isArray(mesh.material)) {
      return mesh.material.map(fn);
    } else {
      return fn(mesh.material);
    }
}
  
const vec = new THREE.Vector3()
const forward = new THREE.Vector3(0, 0, 1)

AFRAME.registerComponent('shader', {
  materials: [{} as THREE.Material & ExtendedMaterial],  
  shaderDef: {} as ShaderExtension,

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


      // TODO:  key a record of new materials, indexed by the original
      // material UUID, so we can just return it if replace is called on
      // the same material more than once
      let replaceMaterial = (oldMaterial: THREE.Material) => {
        //   if (oldMaterial.type != "MeshStandardMaterial") {
        //       console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
        //       return;
        //   }

          //const material = oldMaterial.clone();
          var CustomMaterial
          try {
              CustomMaterial = MaterialModifier.extend (oldMaterial.type, {
                uniforms: shaderDef.uniforms,
                vertexShader: shaderDef.vertexShader,
                fragmentShader: shaderDef.fragmentShader
              })
          } catch(e) {
              return;
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

          material.needsUpdate = true;
          shaderDef.init(material);
          
          return material
      }

      this.materials = []
      let target = this.data.target
      if (target.length == 0) {target=null}
      
      let traverse = (object: THREE.Object3D) => {
        let mesh = object as THREE.Mesh
        if (mesh.material) {
            mapMaterials(mesh, (material: THREE.Material) => {         
                if (!target || material.name === target) {
                    let newM = replaceMaterial(material)
                    if (newM) {
                        mesh.material = newM

                        this.materials.push(newM)
                    }
                }
            })
        }
        const children = object.children;
        for (let i = 0; i < children.length; i++) {
            traverse(children[i]);
        }
    }

    let replaceMaterials = () => {
      // mesh would contain the object that is, or contains, the meshes
      var mesh = this.el.object3DMap.mesh
      if (!mesh) {
          // if no mesh, we'll search through all of the children.  This would
          // happen if we dropped the component on a glb in spoke
          mesh = this.el.object3D
      }
      traverse(mesh);
      this.el.removeEventListener("model-loaded", initializer);
    }

    let root = findAncestorWithComponent(this.el, "gltf-model-plus")
    let initializer = () =>{
        if (this.el.components["media-loader"]) {
            this.el.addEventListener("media-loaded", replaceMaterials)
        } else {
            replaceMaterials()
        }
    };
    root.addEventListener("model-loaded", initializer);

    this.shaderDef = shaderDef
  },

  tick: function(time) {
    if (this.shaderDef == null) { return }

    this.materials.map((mat) => {this.shaderDef.updateUniforms(time, mat)})
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
