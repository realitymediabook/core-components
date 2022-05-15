// simple shader taken from https://threejsfundamentals.org/threejs/lessons/threejs-shadertoy.html
// which in turn is from https://www.shadertoy.com/view/MsXSzM
import { ShaderExtension, ExtendedMaterial } from '../utils/MaterialModifier';
import warpfx from '../assets/warpfx.png'
import snoise from './snoise'
import inverse4x4 from './inverse'

const glsl = String.raw

const uniforms = {
    warpTime: {value: 0},
    warpTex: {value: null},
    texRepeat: { value: new THREE.Vector2(1,1) },
    texOffset: { value: new THREE.Vector2(0,0) },
    texFlipY: { value: 0 },
    portalCubeMap: { value: new THREE.CubeTexture() },
    portalTime: { value: 0 },
    portalRadius: { value: 0.5 },
    portalRingColor: { value: new THREE.Color("red")  },
    invertWarpColor: { value: 0 },
    texInvSize: { value: new THREE.Vector2(1,1) }
} 

interface ExtraBits {
    map: THREE.Texture
}

let cubeMap = new THREE.CubeTexture()

const loader = new THREE.TextureLoader()
var warpTex: THREE.Texture
loader.load(warpfx, (warp) => {
    warp.minFilter = THREE.NearestMipmapNearestFilter;
    warp.magFilter = THREE.LinearFilter;
    warp.wrapS = THREE.RepeatWrapping;
    warp.wrapT = THREE.RepeatWrapping;
    warpTex = warp
    cubeMap.images = [warp.image, warp.image, warp.image, warp.image, warp.image, warp.image]
    cubeMap.needsUpdate = true
})

let WarpPortalShader: ShaderExtension = {
    uniforms: uniforms,
    vertexShader: {
        functions: inverse4x4,
        uniforms: glsl`
        varying vec3 vRay;
        varying vec3 portalNormal;
        //varying vec3 cameraLocal;
        `,
        postTransform: glsl`
        // vec3 cameraLocal = (inverseMat(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
        vec3 cameraLocal = (inverseMat(modelViewMatrix) * vec4(0.0,0.0,0.0, 1.0)).xyz;
        vRay = position - cameraLocal;
        if (vRay.z < 0.0) {
            vRay.z = -vRay.z;
            vRay.x = -vRay.x;
        }
        //vRay = vec3(mvPosition.x, mvPosition.y, mvPosition.z);
        portalNormal = normalize(-1. * vRay);
        //float portal_dist = length(cameraLocal);
        float portal_dist = length(vRay);
        vRay.z *= 1.1 / (1. + pow(portal_dist, 0.5)); // Change FOV by squashing local Z direction
      `
    },

    fragmentShader: {
        functions: snoise,
        uniforms: glsl`
        uniform samplerCube portalCubeMap;
        uniform float portalRadius;
        uniform vec3 portalRingColor;
        uniform float portalTime;
        uniform int invertWarpColor;

        uniform vec2 texInvSize;

        varying vec3 vRay;
        varying vec3 portalNormal;
       // varying vec3 cameraLocal;

        uniform float warpTime;
        uniform sampler2D warpTex;
        uniform vec2 texRepeat;
        uniform vec2 texOffset;
        uniform int texFlipY; 

        #define RING_WIDTH 0.1
        #define RING_HARD_OUTER 0.01
        #define RING_HARD_INNER 0.08
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

          if (portalRadius > 0.0) {
            /// portal shader effect
            vec2 portal_coord = vUv * 2.0 - 1.0;
            float portal_noise = snoise(vec3(portal_coord * 1., portalTime)) * 0.5 + 0.5;
            
            // Polar distance
            float portal_dist = length(portal_coord);
            portal_dist += portal_noise * 0.2;
            
            float maskOuter = 1.0 - smoothstep(portalRadius - RING_HARD_OUTER, portalRadius, portal_dist);
            float maskInner = 1.0 - smoothstep(portalRadius - RING_WIDTH, portalRadius - RING_WIDTH + RING_HARD_INNER, portal_dist);
            float portal_distortion = smoothstep(portalRadius - 0.2, portalRadius + 0.2, portal_dist);
            
            vec3 portalnormal = normalize(portalNormal);
            vec3 forwardPortal = vec3(0.0, 0.0, -1.0);

            float portal_directView = smoothstep(0.0, 0.8, dot(portalnormal, forwardPortal));
            vec3 portal_tangentOutward = normalize(vec3(portal_coord, 0.0));
            vec3 portal_ray = mix(vRay, portal_tangentOutward, portal_distortion);

            vec4 myCubeTexel = textureCube(portalCubeMap, portal_ray);

            myCubeTexel = mapTexelToLinear( myCubeTexel );

            vec3 centerLayer = myCubeTexel.rgb * maskInner;
            vec3 ringLayer = portalRingColor * (1. - maskInner);
            vec3 portal_composite = centerLayer + ringLayer;

            vec4 portalCol = vec4(portal_composite, (maskOuter - maskInner) + maskInner * portal_directView);
          
            // blend the two
            portalCol.rgb *= portalCol.a; //premultiply source 
            col.rgb *= (1.0 - portalCol.a);
            col.rgb += portalCol.rgb;
          }
          diffuseColor *= col;
        `
    },
    init: function(material: THREE.Material & ExtendedMaterial) {
        let mat = (material as THREE.Material & ExtendedMaterial & ExtraBits)

        material.uniforms.texRepeat = { value: mat.map && mat.map.repeat ? mat.map.repeat : new THREE.Vector2(1,1) }
        material.uniforms.texOffset = { value: mat.map && mat.map.offset ? mat.map.offset : new THREE.Vector2(0,0) }
        // we seem to want to flip the flipY
        material.uniforms.texFlipY = { value: mat.map && mat.map.flipY ? 0 : 1 }
        material.userData.timeOffset = (Math.random()+0.5) * 10

        material.uniforms.warpTex.value = warpTex

        // we seem to want to flip the flipY
        material.uniforms.warpTime = { value: 0 }
        material.uniforms.portalTime = { value: 0 }
        material.uniforms.invertWarpColor = { value: mat.userData.invertWarpColor ? mat.userData.invertWarpColor : false}
        material.uniforms.portalRingColor = { value: mat.userData.ringColor ? mat.userData.ringColor : new THREE.Color("red") }
        material.uniforms.portalCubeMap = { value: mat.userData.cubeMap ? mat.userData.cubeMap : cubeMap }
        material.uniforms.portalRadius =  {value: typeof(mat.userData.radius) === 'number' ? mat.userData.radius : 0.5}
    },
    updateUniforms: function(time: number, material: THREE.Material & ExtendedMaterial) {
        material.uniforms.warpTime.value = time * 0.001 + material.userData.timeOffset
        material.uniforms.portalTime.value = time * 0.001 + material.userData.timeOffset

        material.uniforms.warpTex.value = warpTex
        material.uniforms.portalCubeMap.value = material.userData.cubeMap ? material.userData.cubeMap : cubeMap 
        material.uniforms.portalRadius.value = typeof(material.userData.radius) === 'number' ? material.userData.radius : 0.5

        if (material.userData.cubeMap && Array.isArray(material.userData.cubeMap.images) && material.userData.cubeMap.images[0]) {
            let height = material.userData.cubeMap.images[0].height
            let width = material.userData.cubeMap.images[0].width
            material.uniforms.texInvSize.value = new THREE.Vector2(width, height);
        }

    }
}


export { WarpPortalShader }
