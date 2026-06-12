<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class ProposalRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     */
    public function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'summary' => 'nullable|string',
            'category' => 'nullable|string',
            'date' => 'nullable|string',
            'captions' => 'nullable|array',
            'template' => 'nullable|string',
            'status' => 'nullable|string',
            'source_id' => 'nullable|integer',
            'source_name' => 'nullable|string',
            'source_url' => 'nullable|string',
            'generatedTitle' => 'nullable|string',
            'generatedSummary' => 'nullable|string',
            'generatedCaption' => 'nullable|string',
            'suggestedTemplate' => 'nullable|string',
            'hashtags' => 'nullable|array',
            'cta' => 'nullable|string',
            'metadata' => 'nullable|array',
        ];
    }
}
