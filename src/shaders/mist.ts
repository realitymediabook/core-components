// simple shader taken from https://www.shadertoy.com/view/7lfXRB
import shaderToyMain from "./shaderToyMain"
import shaderToyUniformObj from "./shaderToyUniformObj"
import shaderToyUniform_paras from "./shaderToyUniform_paras"
import { ShaderExtension, ExtendedMaterial } from '../utils/MaterialModifier';

const glsl = String.raw

interface ExtraBits {
    map: THREE.Texture
}

let MistShader: ShaderExtension = {
    uniforms: Object.assign({}, shaderToyUniformObj),
    vertexShader: {},

    fragmentShader: {
        uniforms: shaderToyUniform_paras,
        functions: glsl`

        float mrand(vec2 coords)
        {
            return fract(sin(dot(coords, vec2(56.3456,78.3456)) * 5.0) * 10000.0);
        }
        
        float mnoise(vec2 coords)
        {
            vec2 i = floor(coords);
            vec2 f = fract(coords);
        
            float a = mrand(i);
            float b = mrand(i + vec2(1.0, 0.0));
            float c = mrand(i + vec2(0.0, 1.0));
            float d = mrand(i + vec2(1.0, 1.0));
        
            vec2 cubic = f * f * (3.0 - 2.0 * f);
        
            return mix(a, b, cubic.x) + (c - a) * cubic.y * (1.0 - cubic.x) + (d - b) * cubic.x * cubic.y;
        }
        
        float fbm(vec2 coords)
        {
            float value = 0.0;
            float scale = 0.5;
        
            for (int i = 0; i < 10; i++)
            {
                value += mnoise(coords) * scale;
                coords *= 4.0;
                scale *= 0.5;
            }
        
            return value;
        }
        
        
        void mainImage( out vec4 fragColor, in vec2 fragCoord )
        {
            vec2 uv = fragCoord.xy / iResolution.y * 2.0;
         
            float final = 0.0;
            
            for (int i =1; i < 6; i++)
            {
                vec2 motion = vec2(fbm(uv + vec2(0.0,iTime) * 0.05 + vec2(i, 0.0)));
        
                final += fbm(uv + motion);
        
            }
            
            final /= 5.0;
            fragColor = vec4(mix(vec3(-0.3), vec3(0.45, 0.4, 0.6) + vec3(0.6), final), 1);
        }
    `,
    replaceMap: shaderToyMain
    },
    init: function(material: THREE.Material & ExtendedMaterial) {
        let mat = (material as THREE.Material & ExtendedMaterial & ExtraBits)

        material.uniforms.texRepeat = { value: mat.map.repeat }
        material.uniforms.texOffset = { value: mat.map.offset }
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 }
        material.userData.timeOffset = Math.random() * 10
    },
    updateUniforms: function(time: number, material: THREE.Material & ExtendedMaterial) {
        material.uniforms.iTime.value = (time * 0.0012) + material.userData.timeOffset
    }
}


export { MistShader }
