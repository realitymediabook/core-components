// based on https://github.com/jamieowen/three-material-modifier

import defaultHooks from './defaultHooks';

const modifySource = ( source, hookDefs, hooks )=>{

    let match;

    for( let key in hookDefs ){

        if( hooks[key] ){

            match = /insert(before):(.*)|insert(after):(.*)|(replace):(.*)/.exec( hookDefs[key] );

            if( match ){
                if( match[1] ){ // before
                    source = source.replace( match[2], hooks[key] + '\n' + match[2] );
                }else
                if( match[3] ){ // after
                    source = source.replace( match[4], match[4] + '\n' + hooks[key] );
                }else
                if( match[5] ){ // replace
                    source = source.replace( match[6], hooks[key] );
                }

            }

        }
    }

    return source;

}

const cloneUniforms = ( uniforms )=>{

    let clone = {};
    for( let key in uniforms ){ // non-promitive uniform values will be referenced
        clone[ key ] = Object.assign( {}, uniforms[key] );
    }
    return clone;

}

let classMap = {
    MeshStandardMaterial: "standard",
    MeshBasicMaterial: "basic",
    MeshLambertMaterial: "lambert",
    MeshPhongMaterial: "phong",
    MeshDepthMaterial: "depth",
    standard: "standard",
    basic: "basic",
    lambert: "lambert",
    phong: "phong",
    depth: "depth"
}

let shaderMap = null;
const getShaderDef = ( classOrString )=>{

    if( !shaderMap ){

        let classes = {
            standard: THREE.MeshStandardMaterial,
            basic: THREE.MeshBasicMaterial,
            lambert: THREE.MeshLambertMaterial,
            phong: THREE.MeshPhongMaterial,
            depth: THREE.MeshDepthMaterial
        }

        shaderMap = {};

        for( let key in classes ){

            shaderMap[ key ] = {
                ShaderClass: classes[ key ],
                ShaderLib: THREE.ShaderLib[ key ],
                Key: key,
                Count: 0,
                ModifiedName: function(){
                    return `ModifiedMesh${ this.Key[0].toUpperCase() + this.Key.slice(1) }Material_${ ++this.Count }`;
                },
                TypeCheck: `isMesh${ key[0].toUpperCase() + key.slice(1) }Material`

            }

        }
    }

    let shaderDef;

    if( typeof classOrString === 'function' ){
        for( let key in shaderMap ){
            if( shaderMap[ key ].ShaderClass === classOrString ){
                shaderDef = shaderMap[ key ];
                break;
            }
        }
    }else{
        let mappedClassOrString = classMap[ classOrString ]
        shaderDef = shaderMap[ mappedClassOrString || classOrString ];
    }

    if( !shaderDef ){
        throw new Error( 'No Shader found to modify...' );
    }

    return shaderDef;

}


/**
 * The main Material Modofier
 */
class MaterialModifier{

    constructor( vertexHookDefs, fragmentHookDefs ){

        this._vertexHooks = {};
        this._fragmentHooks = {};

        if( vertexHookDefs ){
            this.defineVertexHooks( vertexHookDefs );
        }

        if( fragmentHookDefs ){
            this.defineFragmentHooks( fragmentHookDefs );
        }

    }

    modify( shader, opts ){

        let def = getShaderDef( shader );

        let vertexShader = modifySource( def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {} );
        let fragmentShader = modifySource( def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {} );
        let uniforms = Object.assign( {}, def.ShaderLib.uniforms, opts.uniforms || {} );

        return { vertexShader,fragmentShader,uniforms };

    }

    extend( shader, opts ){

        let def = getShaderDef( shader ); // ADJUST THIS SHADER DEF - ONLY DEFINE ONCE - AND STORE A USE COUNT ON EXTENDED VERSIONS.

        let vertexShader = modifySource( def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {} );
        let fragmentShader = modifySource( def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {} );
        let uniforms = Object.assign( {}, def.ShaderLib.uniforms, opts.uniforms || {} );

        let ClassName = opts.className || def.ModifiedName();

        let extendMaterial = new Function( 'BaseClass', 'uniforms', 'vertexShader', 'fragmentShader', 'cloneUniforms',`

            var cls = function ${ClassName}( params ){

                BaseClass.call( this, params );

                this.uniforms = cloneUniforms( uniforms );

                this.vertexShader = vertexShader;
                this.fragmentShader = fragmentShader;
                this.type = '${ClassName}';

                this.setValues( params );

            }

            cls.prototype = Object.create( BaseClass.prototype );
            cls.prototype.constructor = cls;
            cls.prototype.${ def.TypeCheck } = true;

            cls.prototype.copy = function( source ){

                BaseClass.prototype.copy.call( this, source );

                this.uniforms = Object.assign( {}, source.uniforms );
                this.vertexShader = vertexShader;
                this.fragmentShader = fragmentShader;
                this.type = '${ClassName}';

                return this;

            }

            return cls;

        `);

        if( opts.postModifyVertexShader ){
            vertexShader = opts.postModifyVertexShader( vertexShader );
        }
        if( opts.postModifyFragmentShader ){
            fragmentShader = opts.postModifyFragmentShader( fragmentShader );
        }

        return extendMaterial( def.ShaderClass, uniforms, vertexShader, fragmentShader, cloneUniforms );

    }

    defineVertexHooks( defs ){

        for( let key in defs ){
            this._vertexHooks[ key ] = defs[key];
        }

    }

    defineFragmentHooks( defs ){

        for( let key in defs ){
            this._fragmentHooks[ key ] = defs[key];
        }

    }

}

export { MaterialModifier }

export default new MaterialModifier( defaultHooks.vertexHooks, defaultHooks.fragmentHooks );