// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
// which in turn is from https://www.shadertoy.com/view/MsXSzM
import { ShaderExtension, ExtendedMaterial } from '../utils/MaterialModifier';
import warpfx from '../assets/warpfx.png'

const glsl = String.raw

const uniforms = {
    warpTime: {value: 0},
    warpTex: {value: null},
    texRepeat: { value: new THREE.Vector2(1,1) },
    texOffset: { value: new THREE.Vector2(0,0) },
    invertWarpColor: { value: 0 },
    texFlipY: { value: 0 }
} 

interface ExtraBits {
    map: THREE.Texture
}

const loader = new THREE.TextureLoader()
var warpTex: THREE.Texture
loader.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestFilter;
    warp.magFilter = THREE.NearestFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex = warp
})

let WarpShader: ShaderExtension = {
    uniforms: uniforms,
    vertexShader: {},

    fragmentShader: {
        uniforms: glsl`
        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 

        uniform int invertWarpColor;

                `,
        replaceMap: glsl`
          float t = warpTime;

          vec2 uv = mod(vUv.xy, vec2(1.0,1.0)); //mod(vUv.xy * texRepeat.xy + texOffset.xy, vec2(1.0,1.0));

          if (uv.x < 0.0) { uv.x = uv.x + 1.0;}
          if (uv.y < 0.0) { uv.y = uv.y + 1.0;}
          if (texFlipY > 0) { uv.y = 1.0 - uv.y;}
          uv.x = clamp(uv.x, 0.0, 1.0);
          uv.y = clamp(uv.y, 0.0, 1.0);
  
          vec2 scaledUV = uv * 2.0 - 1.0;
          vec2 puv = vec2(length(scaledUV.xy), atan(scaledUV.x, scaledUV.y));
          vec4 col = texture2D(warpTex, vec2(log(puv.x) + t / 5.0, puv.y / 3.1415926 ));
          float glow = (1.0 - puv.x) * (0.5 + (sin(t) + 2.0 ) / 4.0);
          // blue glow
          col += vec4(118.0/255.0, 144.0/255.0, 219.0/255.0, 1.0) * (0.4 + glow * 1.0);
          // white glow
          col += vec4(0.2) * smoothstep(0.0, 2.0, glow * glow);
          
          col = mapTexelToLinear( col );

          if (invertWarpColor == 1) {
            col = vec4(col.b, col.g, col.r, col.a);   // red
          } else if (invertWarpColor == 2) {
            col = vec4(col.g, col.r, col.b, col.a);   // purple
          } else if (invertWarpColor == 3) {
            col = vec4(col.g, col.b, col.r, col.a);  // green
          }

          diffuseColor *= col;
        `
    },
    init: function(material: THREE.Material & ExtendedMaterial) {
        let mat = (material as THREE.Material & ExtendedMaterial & ExtraBits)

        material.uniforms.texRepeat = { value: mat.map.repeat }
        material.uniforms.texOffset = { value: mat.map.offset }
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map.flipY ? 0 : 1 }
        material.userData.timeOffset = (Math.random()+0.5) * 10

        material.uniforms.invertWarpColor = { value: mat.userData.invertWarpColor ? mat.userData.invertWarpColor : false}

        material.uniforms.warpTex.value = warpTex
        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 }
    },
    updateUniforms: function(time: number, material: THREE.Material & ExtendedMaterial) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset
        material.uniforms.warpTex.value = warpTex
    }
}


export { WarpShader }
