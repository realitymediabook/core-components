const glsl = `
uniform sampler2D panotex;
uniform sampler2D texfx;
uniform float ballTime;
uniform float selected;
varying vec2 ballvUv;
varying vec3 ballvPosition;
varying vec3 ballvNormal;
varying vec3 ballvWorldPos;

uniform float opacity;

void main( void ) {
   vec2 uv = ballvUv;
  //uv.y =  1.0 - uv.y;

   vec3 eye = normalize(cameraPosition - ballvWorldPos);
   float fresnel = abs(dot(eye, ballvNormal));
   float shift = pow((1.0 - fresnel), 4.0) * 0.05;

  vec3 col = vec3(
    texture2D(panotex, uv - shift).r,
    texture2D(panotex, uv).g,
    texture2D(panotex, uv + shift).b
  );

   col = mix(col * 0.7, vec3(1.0), 0.7 - fresnel);

   col += selected * 0.3;

   float t = ballTime * 0.4 + ballvPosition.x + ballvPosition.z;
   uv = vec2(ballvUv.x + t * 0.2, ballvUv.y + t);
   vec3 fx = texture2D(texfx, uv).rgb * 0.4;

  //vec4 col = vec4(1.0, 1.0, 0.0, 1.0);
  gl_FragColor = vec4(col + fx, opacity);
  //gl_FragColor = vec4(col + fx, 1.0);
}
`

export default glsl