// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
// which in turn is from https://www.shadertoy.com/view/MsXSzM
import shaderToyMain from "./shaderToyMain"
import shaderToyUniformObj from "./shaderToyUniformObj"
import shaderToyUniform_paras from "./shaderToyUniform_paras"

const glsl = String.raw

const uniforms = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null }
})

const loader = new THREE.TextureLoader()
var bayerTex = null
loader.load('https://resources.realitymedia.digital/data/images/bayer.png', (bayer) => {
    bayer.minFilter = THREE.NearestFilter;
    bayer.magFilter = THREE.NearestFilter;
    bayer.wrapS = THREE.RepeatWrapping;
    bayer.wrapT = THREE.RepeatWrapping;
    bayerTex = bayer
})
    
let BleepyBlocksShader = {
  uniforms: uniforms,

  vertexShader: {},

  fragmentShader: { 
        uniforms: shaderToyUniform_paras + glsl`
      uniform sampler2D iChannel0;
        `,
        functions: glsl`
      // By Daedelus: https://www.shadertoy.com/user/Daedelus
      // license: Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported License.
      #define TIMESCALE 0.25 
      #define TILES 8
      #define COLOR 0.7, 1.6, 2.8

      void mainImage( out vec4 fragColor, in vec2 fragCoord )
      {
        vec2 uv = fragCoord.xy / iResolution.xy;
        uv.x *= iResolution.x / iResolution.y;
        
        vec4 noise = texture2D(iChannel0, floor(uv * float(TILES)) / float(TILES));
        float p = 1.0 - mod(noise.r + noise.g + noise.b + iTime * float(TIMESCALE), 1.0);
        p = min(max(p * 3.0 - 1.8, 0.1), 2.0);
        
        vec2 r = mod(uv * float(TILES), 1.0);
        r = vec2(pow(r.x - 0.5, 2.0), pow(r.y - 0.5, 2.0));
        p *= 1.0 - pow(min(1.0, 12.0 * dot(r, r)), 2.0);
        
        fragColor = vec4(COLOR, 1.0) * p;
      }
      `,
        replaceMap: shaderToyMain
    },
    init: function(material) {
        material.uniforms.texRepeat = { value: material.map.repeat }
        material.uniforms.texOffset = { value: material.map.offset }
        material.uniforms.texFlipY = { value: material.map.flipY ? 1 : 0 }
        material.uniforms.iChannel0.value = bayerTex
    },
    updateUniforms: function(time, material) {
        material.uniforms.iTime.value = time * 0.001
        material.uniforms.iChannel0.value = bayerTex
    }

}
export { BleepyBlocksShader }