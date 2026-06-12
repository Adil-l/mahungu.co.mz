<?php

namespace App\Http\Controllers;

use App\Http\Requests\FlyerRequest;
use App\Models\Flyer;
use Illuminate\Http\Request;

class FlyerController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index()
    {
        return Flyer::latest()->get();
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(FlyerRequest $request)
    {
        $data = $request->validated();
        // Se há client_id (IndexedDB), faz upsert (evita duplicatas ao editar).
        // Senão, cria novo (compatível com clientes antigos).
        if (!empty($data['client_id'])) {
            return Flyer::updateOrCreate(
                ['client_id' => $data['client_id']],
                $data
            );
        }
        return Flyer::create($data);
    }

    /**
     * Display the specified resource.
     */
    public function show(Flyer $flyer)
    {
        return $flyer;
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(FlyerRequest $request, Flyer $flyer)
    {
        $flyer->update($request->validated());

        return $flyer;
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Flyer $flyer)
    {
        $flyer->delete();

        return response()->noContent();
    }
}
