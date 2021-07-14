// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
// which in turn is from https://www.shadertoy.com/view/MsXSzM
import shaderToyMain from "./shaderToyMain"
import shaderToyUniformObj from "./shaderToyUniformObj"
import shaderToyUniform_paras from "./shaderToyUniform_paras"

const glsl = String.raw

let NoiseShader = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},

    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl`
      // from https://www.shadertoy.com/view/ltB3zD
      //
      // Gold Noise Copyright 2015 dcerisano@standard3d.com
      // - based on the Golden Ratio
      // - uniform normalized distribution
      // - fastest static noise generator function (also runs at low precision)
      // - use with indicated seeding method

      const float PHI = 1.61803398874989484820459; // Φ = Golden Ratio 

      float gold_noise(in vec2 xy, in float seed)
      {
        return fract(tan(distance(xy*PHI, xy)*seed)*xy.x);
      }

      void mainImage(out vec4 rgba, in vec2 xy)
      {
        rgba = vec4(gold_noise(xy, fract(iTime)+1.0), // r
                    gold_noise(xy, fract(iTime)+2.0), // g
                    gold_noise(xy, fract(iTime)+3.0), // b
                    1.0);                             // α
      }
    `,
    replaceMap: shaderToyMain
    },
    init: function(material) {
        material.uniforms.texRepeat = { value: material.map.repeat }
        material.uniforms.texOffset = { value: material.map.offset }
        material.uniforms.texFlipY = { value: material.map.flipY ? 1 : 0 }
    },
    updateUniforms: function(time, material) {
        material.uniforms.iTime.value = time * 0.001
    }
}


export { NoiseShader }
