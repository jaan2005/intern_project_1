const PDFDocument = require('pdfkit');

// Draws a landscape A4 certificate and streams it straight to the HTTP response.
function streamCertificate(res, c) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
  doc.pipe(res);
  const W = doc.page.width;
  const H = doc.page.height;
  const ink = '#14213d';
  const gold = '#b8860b';

  doc.rect(0, 0, W, H).fill('#fbfaf7');
  doc.lineWidth(3).strokeColor(ink).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(1).strokeColor(gold).rect(34, 34, W - 68, H - 68).stroke();

  doc.fillColor(gold).font('Helvetica').fontSize(13).text('CERTIFICATE OF COMPLETION', 0, 90, { align: 'center', characterSpacing: 4 });
  doc.fillColor(ink).font('Times-Roman').fontSize(18).text('This certifies that', 0, 150, { align: 'center' });
  doc.font('Times-Bold').fontSize(44).text(c.studentName, 60, 185, { align: 'center', width: W - 120 });
  doc.font('Times-Roman').fontSize(18).text('has successfully completed the course', 0, 255, { align: 'center' });
  doc.font('Times-Bold').fontSize(28).text(c.courseTitle, 80, 290, { align: 'center', width: W - 160 });

  const date = new Date(c.issuedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(12).fillColor('#444');
  doc.text(`Instructor: ${c.instructorName}`, 80, H - 130, { width: 300 });
  doc.text(`Issued: ${date}`, 80, H - 112, { width: 300 });
  doc.text(`Certificate ID: ${c.certificateId}`, W - 380, H - 130, { width: 300, align: 'right' });
  doc.fontSize(10).fillColor('#777').text(`Verify at ${c.verifyUrl}`, W - 380, H - 112, { width: 300, align: 'right' });
  doc.end();
}

module.exports = { streamCertificate };
