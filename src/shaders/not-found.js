// simple shader taken from https://www.shadertoy.com/view/4t33z8
import shaderToyMain from "./shaderToyMain"
import shaderToyUniformObj from "./shaderToyUniformObj"
import shaderToyUniform_paras from "./shaderToyUniform_paras"
import smallNoise from '../assets/small-noise.png'
import notFound from '../assets/badShader.jpg'

const glsl = String.raw

const uniforms = Object.assign({}, shaderToyUniformObj, {
    iChannel0: { value: null },
    iChannel1: { value: null }
})

const loader = new THREE.TextureLoader()
var noiseTex = null
loader.load(smallNoise, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    noiseTex = noise
})
var notFoundTex = null
loader.load(notFound, (noise) => {
    noise.minFilter = THREE.NearestFilter;
    noise.magFilter = THREE.NearestFilter;
    noise.wrapS = THREE.RepeatWrapping;
    noise.wrapT = THREE.RepeatWrapping;
    notFoundTex = noise
})

let NotFoundShader = {
    uniforms: uniforms,
    vertexShader: {},

    fragmentShader: {
        uniforms: shaderToyUniform_paras + glsl`
        uniform sampler2D iChannel0;
        uniform sampler2D iChannel1;
        `,
        functions: glsl`
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.xy;
            vec2 warpUV = 2. * uv;
        
            float d = length( warpUV );
            vec2 st = warpUV*0.1 + 0.2*vec2(cos(0.071*iTime*2.+d),
                                        sin(0.073*iTime*2.-d));
        
            vec3 warpedCol = texture( iChannel0, st ).xyz * 2.0;
            float w = max( warpedCol.r, 0.85);
            
            vec2 offset = 0.01 * cos( warpedCol.rg * 3.14159 );
            vec3 col = texture( iChannel1, uv + offset ).rgb * vec3(0.8, 0.8, 1.5) ;
            col *= w*1.2;
            
            fragColor = vec4( mix(col, texture( iChannel1, uv + offset ).rgb, 0.5),  1.0);
        }
        `,
    replaceMap: shaderToyMain
    },
    init: function(material) {
        material.uniforms.texRepeat = { value: material.map.repeat }
        material.uniforms.texOffset = { value: material.map.offset }
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: material.map.flipY ? 0 : 1 }
        material.uniforms.iChannel0.value = noiseTex
        material.uniforms.iChannel1.value = notFoundTex
        material.userData.timeOffset = Math.random() * 100000
    },
    updateUniforms: function(time, material) {
        material.uniforms.iTime.value = (time * 0.001) + material.userData.timeOffset
        material.uniforms.iChannel0.value = noiseTex
        material.uniforms.iChannel1.value = notFoundTex
    }
}

export { NotFoundShader }
