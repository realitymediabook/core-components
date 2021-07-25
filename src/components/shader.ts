/**
 * Various simple shaders
 */

// https://www.shadertoy.com/view/MsXSzM:  Bleepy Blocks
import { ShaderExtension, ExtendedMaterial, DefaultMaterialModifier as MaterialModifier } from '../utils/MaterialModifier'

import { BleepyBlocksShader } from '../shaders/bleepy-blocks-shader'
import { NoiseShader } from '../shaders/noise'
import { LiquidMarbleShader } from '../shaders/liquid-marble'
import { GalaxyShader } from '../shaders/galaxy'
import { LaceTunnelShader } from '../shaders/lace-tunnel'
import { FireTunnelShader } from '../shaders/fire-tunnel'
import { MistShader } from '../shaders/mist'
import { Marble1Shader } from '../shaders/marble1'
import { NotFoundShader } from '../shaders/not-found'

const vec = new THREE.Vector3()
const forward = new THREE.Vector3(0, 0, 1)

AFRAME.registerComponent('shader', {
  material: {} as THREE.Material & ExtendedMaterial,  
  shaderDef: {} as ShaderExtension,

  schema: {
      name: { type: 'string', default: "noise" }  // if nothing passed, just create some noise
  },

  init: function () {
      // if we don't set up a shader, we'll just return the original material
      var oldMaterial = (this.el.object3DMap.mesh as THREE.Mesh).material
      if (!(oldMaterial instanceof THREE.Material)) {
        return;
      }
      var shaderDef: ShaderExtension;

      switch (this.data.name) {
        case "noise":
            shaderDef = NoiseShader
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

      if (oldMaterial.type != "MeshStandardMaterial") {
          console.warn("Shader Component: don't know how to handle Shaders of type '" + oldMaterial.type + "', only MeshStandardMaterial at this time.")
          return;
      }

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
      THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial)
      material.needsUpdate = true;

      shaderDef.init(material);
      
      (this.el.object3DMap.mesh as THREE.Mesh).material = material
      this.material = material 
 //     this.shader = true
      this.shaderDef = shaderDef
  },

  tick: function(time) {
    if (this.shaderDef == null) { return }

    this.shaderDef.updateUniforms(time, this.material)
    switch (this.data.name) {
        case "noise":
            break;
        case "bleepyblocks":
            break;
        default:
            break;
    }

    // if (this.shader) {
    //     console.log("fragment shader:", this.material.fragmentShader)
    //     this.shader = null
    // }
  },
})
