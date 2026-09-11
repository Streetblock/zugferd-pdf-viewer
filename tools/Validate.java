import java.io.File;
import java.util.*;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.cos.*;
import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.*;
import org.apache.pdfbox.pdmodel.common.filespecification.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.mustangproject.validator.ZUGFeRDValidator;

/** Local adapter. Reads documents without changing them; no invoice logging. */
class Validate {
    static final List<Map<String, Object>> attachments = new ArrayList<>();
    static final Set<COSDictionary> seen = Collections.newSetFromMap(new IdentityHashMap<>());
    static final Set<COSDictionary> associated = Collections.newSetFromMap(new IdentityHashMap<>());

    static void attachment(PDComplexFileSpecification spec) throws Exception {
        if (!seen.add(spec.getCOSObject())) return;
        PDEmbeddedFile ef = spec.getEmbeddedFileUnicode();
        if (ef == null) ef = spec.getEmbeddedFile();
        if (ef == null) return;
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("filename", spec.getFilename());
        item.put("mime", ef.getSubtype());
        item.put("relationship", spec.getCOSObject().getNameAsString(COSName.getPDFName("AFRelationship")));
        item.put("associated", associated.contains(spec.getCOSObject()));
        // Hash the exact embedded bytes to bind the visible XML to the PDF report.
        try (var input = ef.createInputStream()) {
            var digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[8192];
            int count, total = 0;
            while ((count = input.read(buffer)) != -1) {
                total += count;
                if (total > 20 * 1024 * 1024) throw new IllegalArgumentException("XML-Anhang zu groß");
                digest.update(buffer, 0, count);
            }
            item.put("sha256", HexFormat.of().formatHex(digest.digest()));
        }
        attachments.add(item);
    }

    static void tree(PDNameTreeNode<PDComplexFileSpecification> node, int depth) throws Exception {
        if (depth > 20) throw new IllegalArgumentException("PDF-Namensbaum zu tief");
        if (node.getNames() != null) for (var spec : node.getNames().values()) attachment(spec);
        if (node.getKids() != null) for (var kid : node.getKids()) tree(kid, depth + 1);
    }

    public static void main(String[] args) throws Exception {
        Map<String, Object> result = new LinkedHashMap<>();
        if (args[0].endsWith(".pdf")) {
            try (PDDocument doc = Loader.loadPDF(new File(args[0]))) {
                var catalog = doc.getDocumentCatalog();
                var af = catalog.getCOSObject().getCOSArray(COSName.getPDFName("AF"));
                if (af != null) for (int i = 0; i < af.size(); i++) {
                    if (af.getObject(i) instanceof COSDictionary d) associated.add(d);
                }
                var names = catalog.getNames();
                if (names != null && names.getEmbeddedFiles() != null) tree(names.getEmbeddedFiles(), 0);
                for (var d : associated) attachment(new PDComplexFileSpecification(d));
            }
        }
        var validator = new ZUGFeRDValidator();
        validator.disableNotices(); // No unsolicited XRechnung requirements for B2B profiles.
        result.put("report", validator.validate(args[0]));
        result.put("attachments", attachments);
        System.out.print(new ObjectMapper().writeValueAsString(result));
    }
}
