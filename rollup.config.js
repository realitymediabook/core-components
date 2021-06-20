import { nodeResolve } from '@rollup/plugin-node-resolve';
import { terser } from "rollup-plugin-terser";
import replace from '@rollup/plugin-replace'

var componentPath
if ((process.env.BUILD !== 'production')) {
    componentPath = "https://blairhome.ngrok.io/vue-apps/";
} else {
    componentPath = "https://resources.realitymedia.digital/vue-apps/";
}

export default {
    input: 'src/rooms/index.js',
    output: [{
        file: './build/main.js',
        format: 'es',
        sourcemap: 'inline'
    },
    {
        file: './build/main.min.js',
        format: 'es',
        plugins: [terser()]
    }],
    plugins: [
        nodeResolve(),
        replace({
            'https://resources.realitymedia.digital/vue-apps/': componentPath //JSON.stringify( componentPath )
        }),  
    ]
};