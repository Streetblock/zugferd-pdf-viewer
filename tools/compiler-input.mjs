// Source originals stay immutable. All compiler-only adaptations are explicit.
export function compilerInput(source, pack, schemaHash) {
    const adaptations = ['Virtual xml:base for local resource resolution.'];
    let output = source.replace(/<xsl:(stylesheet|transform)\s/, `<xsl:$1 xml:base="https://zugferd-rules.invalid/${schemaHash}/" `);
    if (output === source) throw new Error('XSLT root not found for virtual XML base.');
    if (pack.key === 'extended') {
        let expressions = 0, literals = 0;
        output = output.replace(/<xsl:when test="([^"]*)"/g, (tag, expression) => {
            const count = expression.split('xs:decimal(100)').length - 1;
            if (!count) return tag;
            expressions++; literals += count;
            // Integer 100 promotes to the same numeric type during multiplication
            // and division. Keep rounding, tolerance and final xs:decimal casts.
            // Avoids SaxonJS 2.7 inferring decimal arithmetic for an untyped sum
            // whose actual value is double. SVRL's original test text is preserved.
            return tag.replaceAll('xs:decimal(100)', '100');
        });
        if (expressions !== 2 || literals !== 4) throw new Error('EXTENDED compiler adaptation no longer matches the pinned rules.');
        adaptations.push('SaxonJS 2.7 numeric-promotion workaround: four xs:decimal(100) literals become 100 in BR-FXEXT-CO-10 and BR-FXEXT-CO-13; original SVRL test text retained.');
    }
    if (pack.key === 'xrechnung' && source.includes('name="xr:checkIBAN"')) {
        let count = 0;
        output = output.replace(/<xsl:function\b[^>]*name="xr:checkIBAN"[\s\S]*?<\/xsl:function>/g, fn =>
            fn.replace('xs:integer(string-join(', () => { count++; return 'xs:decimal(string-join('; }));
        if (count !== 1) throw new Error('XRechnung IBAN compiler adaptation no longer matches the pinned rules.');
        adaptations.push('SaxonJS 2.7 integer-precision workaround: xr:checkIBAN uses xs:decimal instead of xs:integer for the digit string before mod 97; integral values and the original rule predicate are preserved.');
    }
    return { output, adaptations };
}
