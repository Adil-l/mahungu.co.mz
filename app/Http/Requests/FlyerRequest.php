<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class FlyerRequest extends FormRequest
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
            'category' => 'nullable|string|max:100',
            'content' => 'nullable|string',
            'template' => 'nullable|string|max:50',
            'html' => 'nullable|string',
            'image' => 'nullable|string',
            'background_image' => 'nullable|string',
            'status' => 'nullable|string|max:20',
            'captions' => 'nullable|array',
            'metadata' => 'nullable|array',
            'state' => 'nullable|array', // Adicionando suporte para o campo 'state' que o frontend envia
        ];
    }
}
