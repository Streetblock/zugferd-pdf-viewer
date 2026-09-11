// Source originals stay immutable. All compiler-only adaptations are explicit.
export function compilerInput(source, pack, schemaHash) {
    const adaptations = ['Virtual xml:base for local resource resolution.'];
    let output = source.replace('<xsl:stylesheet ', `<xsl:stylesheet xml:base="https://zugferd-rules.invalid/${schemaHash}/" `);
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
    return { output, adaptations };
}
