import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";
import replace from '@rollup/plugin-replace'

var componentPath
if ((process.env.BUILD !== 'production')) {
    componentPath = "https://jayhome.ngrok.io/vue-apps/";
} else {
    componentPath = "https://resources.realitymedia.digital/vue-apps/";
}

export default ['index', 'main-room'].map((name, index) => ({
    input: `src/rooms/${name}.js`,
    output: [{
        file: `./build/${name}.js`,
        format: 'es',
        sourcemap: 'inline'
    },
    {
        file: `./build/${name}.min.js`,
        format: 'es',
        plugins: [terser()]
    }],
    plugins: [
        nodeResolve(),
        replace({
            'https://resources.realitymedia.digital/vue-apps/': componentPath //JSON.stringify( componentPath )
        }),  
    ]
}));