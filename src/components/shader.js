/**
 * Various simple shaders
 */

// https://www.shadertoy.com/view/MsXSzM:  Bleepy Blocks
import { BleepyBlocksShader } from '../shaders/bleepy-blocks-shader.js'
import { NoiseShader } from '../shaders/noise.js'
import { LiquidMarbleShader } from '../shaders/liquid-marble.js'
import MaterialModifier from '../utils/MaterialModifier.js'
import { THREE } from 'ethereal'
import { GalaxyShader } from '../shaders/galaxy.js'
import { LaceTunnelShader } from '../shaders/lace-tunnel.js'
import { MistShader } from '../shaders/mist.js'
import { Marble1Shader } from '../shaders/marble1.js'

const vec = new THREE.Vector3()
const forward = new THREE.Vector3(0, 0, 1)

AFRAME.registerComponent('shader', {
  schema: {
      name: { type: 'string', default: "noise" }  // if nothing passed, just create some noise
  },

  init: function () {
      // if we don't set up a shader, we'll just return the original material
      var oldMaterial = this.el.object3DMap.mesh.material
      var shaderDef;

      switch (this.data.name) {
        case "noise":
            shaderDef = NoiseShader
            break;

        case "liquidmarble":
            shaderDef = LiquidMarbleShader
            break;
    
        case "bleepyblocks":
            shaderDef = Marble1Shader
            break;

        case "galaxy":
            shaderDef = GalaxyShader
            break;

        case "lacetunnel":
            shaderDef = LaceTunnelShader
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
            return 
            break;
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
      let material = new CustomMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(material, oldMaterial)
      material.needsUpdate = true;

      shaderDef.init(material)

      this.el.object3DMap.mesh.material = material
      this.material = material 
      this.shader = true
      this.shaderDef = shaderDef
  },

  tick: function(time) {
    if (!this.shaderDef) { return }

    this.shaderDef.updateUniforms(time, this.material)
    switch (this.data.name) {
        case "noise":
            break;
        case "bleepyblocks":
            break;
        default:
            break;
    }

    if (this.shader) {
        console.log("fragment shader:", this.material.fragmentShader)
        this.shader = null
    }
  },
})
