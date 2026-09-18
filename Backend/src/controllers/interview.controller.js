
const pdfParsePackage = require("pdf-parse");
const { generateInterviewReport, generateResumePdf } = require("../services/ai.service");
const interviewReportModel = require("../models/interviewReport.model");
const fs = require("fs");

/**
 * Helper to safely extract text from pdf-parse across different package versions
 */
async function extractPdfText(buffer) {
    const uint8ArrayData = new Uint8Array(buffer);

    if (typeof pdfParsePackage === "function") {
        const data = await pdfParsePackage(buffer);
        return data.text || "";
    }
    if (pdfParsePackage.PDFParse) {
        const parser = new pdfParsePackage.PDFParse(uint8ArrayData);
        if (typeof parser.getText === "function") {
            const result = await parser.getText();
            return typeof result === "string" ? result : (result?.text || "");
        }
    }
    if (pdfParsePackage.default) {
        if (typeof pdfParsePackage.default === "function") {
            const data = await pdfParsePackage.default(buffer);
            return data.text || "";
        }
        if (pdfParsePackage.default.PDFParse) {
            const parser = new pdfParsePackage.default.PDFParse(uint8ArrayData);
            if (typeof parser.getText === "function") {
                const result = await parser.getText();
                return typeof result === "string" ? result : (result?.text || "");
            }
        }
    }
    throw new Error("Unable to initialize pdf parser from pdf-parse package.");
}

/**
 * @description Controller to generate interview report based on user self description, resume and job description.
 */
async function generateInterViewReportController(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ message: "No resume file uploaded." });
        }

        // Handle both memoryStorage (buffer) and diskStorage (path)
        let fileBuffer;
        if (req.file.buffer) {
            fileBuffer = req.file.buffer;
        } else if (req.file.path) {
            fileBuffer = fs.readFileSync(req.file.path);
        } else {
            return res.status(400).json({ message: "Unable to read uploaded resume file." });
        }

        // Safe extraction using Uint8Array
        const resumeText = await extractPdfText(fileBuffer);

        const { selfDescription, jobDescription } = req.body;

        const interViewReportByAi = await generateInterviewReport({
            resume: resumeText,
            selfDescription,
            jobDescription
        });

        const interviewReport = await interviewReportModel.create({
            user: req.user.id,
            resume: resumeText,
            selfDescription,
            jobDescription,
            ...interViewReportByAi
        });

        res.status(201).json({
            message: "Interview report generated successfully.",
            interviewReport
        });
    } catch (error) {
        console.error("Error in generateInterViewReportController:", error);
        res.status(500).json({
            message: "Failed to generate interview report.",
            error: error.message
        });
    }
}

/**
 * @description Controller to get interview report by interviewId.
 */
async function getInterviewReportByIdController(req, res) {
    try {
        const { interviewId } = req.params;

        const interviewReport = await interviewReportModel.findOne({ _id: interviewId, user: req.user.id });

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            });
        }

        res.status(200).json({
            message: "Interview report fetched successfully.",
            interviewReport
        });
    } catch (error) {
        console.error("Error in getInterviewReportByIdController:", error);
        res.status(500).json({ message: "Failed to fetch interview report.", error: error.message });
    }
}

/** 
 * @description Controller to get all interview reports of logged in user.
 */
async function getAllInterviewReportsController(req, res) {
    try {
        const interviewReports = await interviewReportModel.find({ user: req.user.id })
            .sort({ createdAt: -1 })
            .select("-resume -selfDescription -jobDescription -__v -technicalQuestions -behavioralQuestions -skillGaps -preparationPlan");

        res.status(200).json({
            message: "Interview reports fetched successfully.",
            interviewReports
        });
    } catch (error) {
        console.error("Error in getAllInterviewReportsController:", error);
        res.status(500).json({ message: "Failed to fetch reports.", error: error.message });
    }
}

/**
 * @description Controller to generate resume PDF based on user self description, resume and job description.
 */
async function generateResumePdfController(req, res) {
    try {
        const { interviewReportId } = req.params;

        const interviewReport = await interviewReportModel.findById(interviewReportId);

        if (!interviewReport) {
            return res.status(404).json({
                message: "Interview report not found."
            });
        }

        const { resume, jobDescription, selfDescription } = interviewReport;

        const pdfBuffer = await generateResumePdf({ resume, jobDescription, selfDescription });

        res.set({
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename=resume_${interviewReportId}.pdf`
        });

        res.send(pdfBuffer);
    } catch (error) {
        console.error("Error in generateResumePdfController:", error);
        res.status(500).json({ message: "Failed to generate resume PDF.", error: error.message });
    }
}

module.exports = {
    generateInterViewReportController,
    getInterviewReportByIdController,
    getAllInterviewReportsController,
    generateResumePdfController
};