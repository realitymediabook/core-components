/**
 * Description
 * ===========
 * Create the illusion of depth in a color image from a depth map
 *
 * Usage
 * =====
 * Create a plane in Blender and give it a material (just the default Principled BSDF).
 * Assign color image to "color" channel and depth map to "emissive" channel.
 * You may want to set emissive strength to zero so the preview looks better.
 * Add the "parallax" component from the Hubs extension, configure, and export as .glb
 */

// https://www.shadertoy.com/view/MsXSzM:  Bleepy Blocks
import { BleepyBlocksShader } from '../shaders/bleepy-blocks-shader.js'

const vec = new THREE.Vector3()
const forward = new THREE.Vector3(0, 0, 1)

AFRAME.registerComponent('shader', {
  schema: {
      name: { type: 'string', default: "noise" }  // if nothing passed, just create some noise
  },
  init: function () {
    this.shaderMaterial = getShader(this.data.name)
    this.shaderMaterial && (this.el.object3DMap.mesh.material = this.shaderMaterial)
  },

  getShader(name) {
      // if we don't set up a shader, we'll just return the original material
      var material = this.el.object3DMap.mesh.material

      switch (name) {
        case "noise":
            break;
        case "bleepyblocks":
            const { vertexShader, fragmentShader, uniforms } = BleepyBlocksShader
            material = new THREE.ShaderMaterial({
                vertexShader,
                fragmentShader,
                uniforms
            })
        default:
            // an unknown name was passed in
            console.warn("unknown name '" + name + "' passed to shader component")
            break;
      }
      return material
  },

  tick() {
    switch (name) {
        case "noise":
            break;
        case "bleepyblocks":
            this.material.uniforms.iTime.value = time;
        default:
            break;
    }
  },
})
